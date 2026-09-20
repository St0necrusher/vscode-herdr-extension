import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { SessionsFeature } from "../../src/features/sessions/SessionsFeature.js";
import { VsCodeSessionsView } from "../../src/features/sessions/view/VsCodeSessionsView.js";
import type { SessionsState, SessionsStateSource } from "../../src/features/sessions/capabilities/index.js";

let sequence = 0;
const commandIds = [
  "herdr.showStatusActions",
  "herdr.start",
  "herdr.retryDiscovery",
  "herdr.selectExecutable",
  "herdr.openSettings",
  "herdr.selectSession",
  "herdr.refreshSessions",
];

async function withNamespacedCommands(
  run: (prefix: string, registered: string[]) => Promise<void>,
  failAt?: number,
): Promise<void> {
  const original = vscode.commands.registerCommand;
  const prefix = `herdr.test.${++sequence}.`;
  const registered: string[] = [];
  vscode.commands.registerCommand = (...args: Parameters<typeof original>) => {
    if (registered.length === failAt) throw new Error("registration failed");
    const result = original(prefix + args[0], args[1], args[2]);
    registered.push(args[0]);
    return result;
  };
  try {
    await run(prefix, registered);
  } finally {
    vscode.commands.registerCommand = original;
  }
}

function stateSource(initial: SessionsState): { source: SessionsStateSource; setState(state: SessionsState): void } {
  let state = initial;
  const listeners = new Set<(next: SessionsState) => void>();
  return {
    source: {
      getState: () => state,
      onDidChange: (listener) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
    },
    setState: (next) => {
      state = next;
      for (const listener of listeners) listener(next);
    },
  };
}

function tooltipText(item: vscode.TreeItem): string {
  const tooltip = item.tooltip;
  return typeof tooltip === "string" ? tooltip : (tooltip?.value ?? "");
}

function rowsFor(view: VsCodeSessionsView, id: string): vscode.TreeItem {
  const row = view.getChildren().find((item) => item.id === id);
  assert.ok(row);
  return row;
}

function dependencies(options: { list?: () => Promise<never>; configurationFailure?: boolean } = {}) {
  const configuration = { executable: "unused-test-herdr", session: "default" };
  const calls: string[] = [];
  let storedSelection: unknown;
  let subscribed = false;
  return {
    calls,
    subscribed: () => subscribed,
    value: {
      directory: {
        list:
          options.list ??
          (() =>
            Promise.resolve({
              kind: "success" as const,
              sessions: [{ id: "default", isDefault: true, availability: "stopped" as const }],
            })),
        resolve: () => Promise.reject(new Error("stopped Session must not resolve")),
        start: (_configuration: typeof configuration, sessionId: string) => {
          assert.equal(sessionId, "default");
          calls.push("start");
          return Promise.resolve();
        },
      },
      connectionFactory: {
        create: () => ({
          bootstrap: () => Promise.reject(new Error("stopped Session must not connect")),
          dispose: () => undefined,
        }),
      },
      configuration: {
        read: () => configuration,
        onDidChange: () => {
          if (options.configurationFailure) throw new Error("configuration subscription failed");
          subscribed = true;
          return {
            dispose: () => {
              subscribed = false;
            },
          };
        },
      },
      configurationActions: {
        selectExecutable: () => {
          calls.push("select-executable");
          return Promise.resolve();
        },
        openSettings: () => {
          calls.push("open-settings");
          return Promise.resolve();
        },
      },
      logger: { info: () => undefined, error: () => undefined, show: () => undefined },
      storage: {
        get: () => storedSelection,
        update: (_key: string, value: unknown) => {
          storedSelection = value;
          calls.push(`save:${String(value)}`);
          return Promise.resolve();
        },
      },
    },
  };
}

suite("Sessions feature host bindings and lifecycle", () => {
  test("Feature owns command registration, routes commands, and disposes all resources", async () => {
    await withNamespacedCommands(async (prefix, registered) => {
      const d = dependencies();
      const feature = new SessionsFeature(d.value);
      try {
        assert.deepEqual(registered, commandIds);
        await feature.initialize();
        assert.equal(d.subscribed(), true);
        assert.equal(d.calls.includes("save:default"), true);
        await vscode.commands.executeCommand(prefix + "herdr.start");
        await vscode.commands.executeCommand(prefix + "herdr.refreshSessions");
        await vscode.commands.executeCommand(prefix + "herdr.selectSession", "default");
        assert.equal(d.calls.filter((call) => call === "start").length, 1);
      } finally {
        feature.dispose();
      }
      assert.equal(d.subscribed(), false);
      const remaining = await vscode.commands.getCommands(true);
      assert.ok(commandIds.every((id) => !remaining.includes(prefix + id)));
    });
  });

  test("Sessions View keeps all rows visible, exposes Start diagnostics, and preserves selection intent", () => {
    const defaultSession = { id: "default", isDefault: true, availability: "running" as const };
    const workSession = { id: "work", isDefault: false, availability: "stopped" as const };
    const initial: SessionsState = {
      configuration: { executable: "herdr", session: "work" },
      catalog: { kind: "ready", sessions: [defaultSession, workSession] },
      active: { kind: "start-failed", session: workSession, diagnostic: "start denied" },
    };
    const harness = stateSource(initial);
    const view = new VsCodeSessionsView(harness.source);
    try {
      const rows = view.getChildren();
      assert.equal(rows.length, 2);
      const selected = rows.find((row) => row.id === "work");
      const other = rows.find((row) => row.id === "default");
      assert.ok(selected);
      assert.ok(other);
      assert.match(tooltipText(selected), /Diagnostic: start denied/);
      assert.equal(other.command?.command, "herdr.selectSession");

      harness.setState({
        ...initial,
        active: {
          kind: "incompatible",
          session: defaultSession,
          endpoint: "/tmp/default.sock",
          failure: { kind: "incompatible", diagnostic: "unsupported", version: "0.9.1", protocol: 22 },
        },
      });
      const compatibleMetadata = rowsFor(view, "default");
      assert.match(tooltipText(compatibleMetadata), /Version: 0.9.1/);
      assert.match(tooltipText(compatibleMetadata), /Protocol: 22/);

      harness.setState({
        ...initial,
        active: {
          kind: "disconnected",
          session: defaultSession,
          endpoint: "/tmp/default.sock",
          metadata: { version: "0.9.1", protocol: 22 },
          failure: { kind: "transport", diagnostic: "socket closed" },
        },
      });
      const disconnectedMetadata = rowsFor(view, "default");
      assert.match(tooltipText(disconnectedMetadata), /Version: 0.9.1/);
      assert.match(tooltipText(disconnectedMetadata), /Protocol: 22/);

      harness.setState({
        ...initial,
        active: {
          kind: "incompatible",
          session: defaultSession,
          failure: { kind: "incompatible", diagnostic: "metadata unavailable" },
        },
      });
      const unavailableMetadata = rowsFor(view, "default");
      assert.doesNotMatch(tooltipText(unavailableMetadata), /Version:/);
      assert.doesNotMatch(tooltipText(unavailableMetadata), /Protocol:/);
    } finally {
      view.dispose();
    }
  });

  test("partial Feature command registration cleans earlier registrations and Views", async () => {
    await withNamespacedCommands((_prefix, registered) => {
      const d = dependencies();
      assert.throws(() => new SessionsFeature(d.value), /registration failed/);
      assert.equal(registered.length, 2);
      return Promise.resolve();
    }, 2);
  });

  test("initialization failure disposes command registrations and configuration subscription", async () => {
    await withNamespacedCommands(async (prefix, registered) => {
      const d = dependencies({ configurationFailure: true });
      const feature = new SessionsFeature(d.value);
      try {
        await assert.rejects(feature.initialize(), /configuration subscription failed/);
        assert.equal(d.subscribed(), false);
        const remaining = await vscode.commands.getCommands(true);
        assert.ok(registered.every((id) => !remaining.includes(prefix + id)));
      } finally {
        feature.dispose();
      }
    });
  });

  test("disposal before initialization prevents model initialization and command use", async () => {
    await withNamespacedCommands(async (prefix, registered) => {
      const d = dependencies();
      const feature = new SessionsFeature(d.value);
      feature.dispose();
      await feature.initialize();
      assert.equal(d.calls.length, 0);
      assert.equal(registered.length, commandIds.length);
      let commandFailed = false;
      try {
        await vscode.commands.executeCommand(prefix + "herdr.start");
      } catch {
        commandFailed = true;
      }
      assert.equal(commandFailed, true);
    });
  });
});
