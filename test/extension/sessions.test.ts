import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { SessionsFeature } from "../../src/features/sessions/SessionsFeature";
import { VsCodeSessionsView } from "../../src/features/sessions/view/VsCodeSessionsView";
import type { ActiveSessionProjectionState } from "../../src/modules/sessions/activeSessionProjection";
import type { HerdrSessionConnection } from "../../src/api/herdr/connection/connection";
import type { SessionsState, SessionsStateSource } from "../../src/modules/sessions/sessionsState";

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
        start: (_executable: string, sessionId: string) => {
          assert.equal(sessionId, "default");
          calls.push("start");
          return Promise.resolve();
        },
      },
      connectionFactory: {
        create: () => ({
          bootstrap: () => Promise.reject(new Error("stopped Session must not connect")),
          createSpace: () => Promise.reject(new Error("stopped Session must not connect")),
          createPane: () => Promise.reject(new Error("stopped Session must not connect")),
          splitPane: () => Promise.reject(new Error("stopped Session must not connect")),
          runCommand: () => Promise.reject(new Error("stopped Session must not connect")),
          renamePane: () => Promise.reject(new Error("stopped Session must not connect")),
          renameTab: () => Promise.reject(new Error("stopped Session must not connect")),
          moveTab: () => Promise.reject(new Error("stopped Session must not connect")),
          renameSpace: () => Promise.reject(new Error("stopped Session must not connect")),
          closePane: () => Promise.reject(new Error("stopped Session must not connect")),
          closeTab: () => Promise.reject(new Error("stopped Session must not connect")),
          closeSpace: () => Promise.reject(new Error("stopped Session must not connect")),
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
  test("the registered Sessions view is contributed in package.json", async () => {
    await withNamespacedCommands(() => {
      const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
      assert.ok(extension);
      const manifest = extension.packageJSON as { contributes: { views: Record<string, { id: string }[]> } };
      const contributed = Object.values(manifest.contributes.views)
        .flat()
        .map(({ id }) => id);
      const original = vscode.window.registerTreeDataProvider;
      const registered: string[] = [];
      vscode.window.registerTreeDataProvider = <T>(viewId: string, provider: vscode.TreeDataProvider<T>) => {
        registered.push(viewId);
        return original(viewId, provider);
      };
      let feature: SessionsFeature | undefined;
      try {
        feature = new SessionsFeature(dependencies().value);
        assert.deepEqual(registered, ["herdr.sessions"]);
        registered.forEach((id) => assert.ok(contributed.includes(id)));
      } finally {
        feature?.dispose();
        vscode.window.registerTreeDataProvider = original;
      }
      return Promise.resolve();
    });
  });

  test("status commands and every offered quick-pick action route to their dependency", async () => {
    await withNamespacedCommands(async (prefix) => {
      const d = dependencies();
      let lists = 0;
      d.value.directory.list = () => {
        lists++;
        return Promise.resolve({
          kind: "success",
          sessions: [{ id: "default", isDefault: true, availability: "stopped" }],
        });
      };
      d.value.logger.show = () => {
        d.calls.push("diagnostics");
      };
      const feature = new SessionsFeature(d.value);
      const original = vscode.window.showQuickPick;
      let choice = "";
      const offered: string[][] = [];
      vscode.window.showQuickPick = ((items: readonly (vscode.QuickPickItem & { id: string })[]) => {
        offered.push(items.map((item) => item.id));
        const item = items.find((item) => item.id === choice);
        assert.ok(item, `Action ${choice} is offered`);
        return Promise.resolve(item);
      }) as unknown as typeof original;
      try {
        await feature.initialize();
        const before = lists;
        await vscode.commands.executeCommand(prefix + "herdr.retryDiscovery");
        assert.equal(lists, before + 1);
        await vscode.commands.executeCommand(prefix + "herdr.selectExecutable");
        await vscode.commands.executeCommand(prefix + "herdr.openSettings");
        assert.equal(d.calls.filter((call) => call === "select-executable").length, 1);
        assert.equal(d.calls.filter((call) => call === "open-settings").length, 1);
        for (const action of ["start", "retry", "open-settings", "show-diagnostics"]) {
          choice = action;
          await vscode.commands.executeCommand(prefix + "herdr.showStatusActions");
        }
        assert.equal(d.calls.filter((call) => call === "start").length, 1);
        assert.equal(d.calls.filter((call) => call === "open-settings").length, 2);
        assert.equal(d.calls.filter((call) => call === "diagnostics").length, 1);
        assert.equal(lists, before + 3);
        assert.equal(offered.length, 4);
      } finally {
        vscode.window.showQuickPick = original;
        feature.dispose();
      }
      const missing = dependencies({ list: () => Promise.resolve({ kind: "missing-executable" }) as Promise<never> });
      const missingFeature = new SessionsFeature(missing.value);
      vscode.window.showQuickPick = ((items: readonly (vscode.QuickPickItem & { id: string })[]) => {
        const item = items.find((item) => item.id === "select-executable");
        assert.ok(item);
        return Promise.resolve(item);
      }) as unknown as typeof original;
      try {
        await missingFeature.initialize();
        await vscode.commands.executeCommand(prefix + "herdr.showStatusActions");
        assert.deepEqual(missing.calls, ["select-executable"]);
      } finally {
        vscode.window.showQuickPick = original;
        missingFeature.dispose();
      }
    });
  });

  test("active Session projection publishes connected, retained Stale, and unavailable states", async () => {
    await withNamespacedCommands(async (prefix) => {
      const d = dependencies();
      const snapshot = { version: "1", protocol: 1, spaces: [], herdrTabs: [], panes: [], layouts: [], agents: [] };
      let consumer: Parameters<HerdrSessionConnection["bootstrap"]>[0] | undefined;

      const value = {
        ...d.value,
        directory: {
          ...d.value.directory,
          list: () =>
            Promise.resolve({
              kind: "success" as const,
              sessions: [{ id: "default", isDefault: true, availability: "running" as const }],
            }),
          resolve: () => Promise.resolve({ id: "default", endpoint: "/tmp/test.sock" }),
        },
        connectionFactory: {
          create: () => ({
            ...d.value.connectionFactory.create(),
            bootstrap: (next: Parameters<HerdrSessionConnection["bootstrap"]>[0]) => {
              consumer = next;
              next.replaceSnapshot(snapshot);
              return Promise.resolve({ version: "1", protocol: 1 });
            },
          }),
        },
      };
      const feature = new SessionsFeature(value);
      const changes: ActiveSessionProjectionState[] = [];
      const subscription = feature.onDidChangeActiveSessionProjection((state) => changes.push(state));
      try {
        assert.deepEqual(feature.getActiveSessionProjection(), { kind: "unavailable" });
        await feature.initialize();
        assert.deepEqual(feature.getActiveSessionProjection(), { kind: "connected", sessionId: "default", snapshot });
        assert.ok(consumer);
        consumer.connectionClosed({ kind: "transport", diagnostic: "closed" });
        const reconnecting = { kind: "stale", sessionId: "default", reason: "reconnecting", snapshot };
        assert.deepEqual(feature.getActiveSessionProjection(), reconnecting);
        assert.ok(changes.some((state) => state.kind === "stale" && state.reason === "reconnecting"));
        await vscode.commands.executeCommand(prefix + "herdr.retryDiscovery");
        assert.ok(consumer);
        consumer.connectionClosed({ kind: "incompatible", diagnostic: "unsupported" });
        const stale = { kind: "stale", sessionId: "default", reason: "incompatible", snapshot };
        assert.deepEqual(feature.getActiveSessionProjection(), stale);
        assert.deepEqual(changes.at(-1), stale);
        value.directory.list = () => Promise.resolve({ kind: "success", sessions: [] });
        await vscode.commands.executeCommand(prefix + "herdr.refreshSessions");
        assert.equal(feature.getActiveSessionProjection().kind, "unavailable");
        assert.equal(changes.at(-1)?.kind, "unavailable");
      } finally {
        subscription.dispose();
        feature.dispose();
      }
    });
  });

  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension, "Extension is installed in the test host");
    await extension.activate();
  });

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
          kind: "reconnecting",
          session: defaultSession,
          endpoint: "/tmp/default.sock",
          staleProjection: {
            metadata: { version: "0.9.1", protocol: 22 },
            snapshot: { version: "0.9.1", protocol: 22, spaces: [], herdrTabs: [], panes: [], layouts: [], agents: [] },
          },
          failure: { kind: "transport", diagnostic: "socket closed" },
          phase: { kind: "waiting", retryAt: Date.now() + 1000 },
        },
      });
      const reconnectingMetadata = rowsFor(view, "default");
      assert.match(reconnectingMetadata.description as string, /reconnecting/);
      assert.doesNotMatch(reconnectingMetadata.description as string, /disconnected/);
      assert.match(tooltipText(reconnectingMetadata), /State: reconnecting/);
      assert.match(tooltipText(reconnectingMetadata), /Diagnostic: socket closed/);
      assert.match(tooltipText(reconnectingMetadata), /Version: 0.9.1/);
      assert.match(tooltipText(reconnectingMetadata), /Protocol: 22/);
      assert.match(tooltipText(reconnectingMetadata), /Next attempt:/);

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
