import * as assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { SessionsModel } from "../../src/modules/sessions/SessionsModel";
import { VsCodeSessionsView } from "../../src/views/sidebar/sessions/VsCodeSessionsView";
import { ConnectionStatus } from "../../src/views/connection-status/ConnectionStatus";
import { ConfigureExecutableFeature } from "../../src/features/configure-executable/ConfigureExecutableFeature";
import { HerdrExtension } from "../../src/extension/HerdrExtension";
import { HerdrSettings } from "../../src/extension/HerdrSettings";
import type { ActiveSessionProjectionState } from "../../src/modules/sessions/activeSessionProjection";
import type { HerdrSessionConnection } from "../../src/api/herdr/connection/connection";
import type { SessionsState, SessionsStateSource } from "../../src/modules/sessions/sessionsState";

let sequence = 0;
const commandIds = [
  "herdr.selectSession",
  "herdr.refreshSessions",
  "herdr.selectExecutable",
  "herdr.showStatusActions",
  "herdr.start",
  "herdr.retryDiscovery",
  "herdr.openSettings",
];

async function withNamespacedCommands(
  run: (prefix: string, registered: string[]) => Promise<void>,
  failAt?: number,
  sessionsOnly = false,
): Promise<void> {
  const original = vscode.commands.registerCommand;
  const prefix = `herdr.test.${++sequence}.`;
  const registered: string[] = [];
  vscode.commands.registerCommand = (...args: Parameters<typeof original>) => {
    if (registered.length === failAt) throw new Error("registration failed");
    const result = original(prefix + args[0], args[1], args[2]);
    const shouldRecordCommand = !sessionsOnly || commandIds.includes(args[0]);
    if (shouldRecordCommand) registered.push(args[0]);
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

function sessionBindings(value: {
  directory: ConstructorParameters<typeof SessionsModel>[0];
  connectionFactory: ConstructorParameters<typeof SessionsModel>[1];
  configuration: ConstructorParameters<typeof SessionsModel>[2];
  storage: ConstructorParameters<typeof SessionsModel>[3];
  logger: ConstructorParameters<typeof SessionsModel>[4];
  configurationActions: ReturnType<typeof dependencies>["value"]["configurationActions"];
}) {
  const model = new SessionsModel(
    value.directory,
    value.connectionFactory,
    value.configuration,
    value.storage,
    value.logger,
  );
  const resources: vscode.Disposable[] = [model];
  const executeCommand = vscode.commands.executeCommand;
  vscode.commands.executeCommand = ((command: string, ...args: unknown[]) => {
    if (command === "workbench.action.openSettings") return value.configurationActions.openSettings();
    return executeCommand(command, ...args);
  }) as typeof executeCommand;
  resources.push({
    dispose: () => {
      vscode.commands.executeCommand = executeCommand;
    },
  });
  try {
    const view = new VsCodeSessionsView(model, model);
    resources.push(view);
    const configure = new ConfigureExecutableFeature();
    configure.selectExecutable = value.configurationActions.selectExecutable;
    resources.push(configure);
    const status = new ConnectionStatus(model, model, configure, value.logger);
    resources.push(status);
    return {
      model,
      dispose: () =>
        resources.reverse().forEach((resource) => {
          resource.dispose();
        }),
    };
  } catch (error) {
    resources.reverse().forEach((resource) => {
      resource.dispose();
    });
    throw error;
  }
}

// A herdr CLI that reports the takeover plugin as registered and holds `plugin list` until released.
async function fakeTakeoverHerdr() {
  const directory = await mkdtemp(join(tmpdir(), "herdr-takeover-lifecycle-"));
  const executable = join(directory, "herdr");
  const invocationLogPath = join(directory, "invocations.jsonl");
  const releasePath = join(directory, "release");
  const pluginListExitedPath = join(directory, "plugin-list-exited");
  const pluginList = JSON.stringify({ result: { plugins: [{ plugin_id: "st0necrusher.vscode-herdr-takeover" }] } });
  await writeFile(invocationLogPath, "");
  await writeFile(
    executable,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(invocationLogPath)}, JSON.stringify(args) + "\\n");
if (args.join(" ") === "plugin list --json") {
  const timer = setInterval(() => {
    if (!fs.existsSync(${JSON.stringify(releasePath)})) return;
    clearInterval(timer);
    process.stdout.write(${JSON.stringify(pluginList)});
    fs.writeFileSync(${JSON.stringify(pluginListExitedPath)}, "");
  }, 10);
}
`,
    "utf8",
  );
  await chmod(executable, 0o755);
  return {
    executable,
    async answerPluginList(): Promise<void> {
      await writeFile(releasePath, "");
      while (!existsSync(pluginListExitedPath)) await new Promise((resolve) => setTimeout(resolve, 10));
    },
    async invocations(): Promise<string[][]> {
      const contents = await readFile(invocationLogPath, "utf8");
      return contents
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line) as string[]);
    },
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}

function extensionForLifecycle(d: ReturnType<typeof dependencies>): {
  extension: HerdrExtension;
  globalStorageUri: vscode.Uri;
  dispose(): void;
} {
  const descriptors = Object.getOwnPropertyDescriptors(HerdrSettings.prototype);
  const createOutputChannel = vscode.window.createOutputChannel;
  vscode.window.createOutputChannel = () =>
    ({ ...d.value.logger, dispose: () => undefined }) as unknown as vscode.LogOutputChannel;
  HerdrSettings.prototype.read = d.value.configuration.read;
  HerdrSettings.prototype.onDidChange = d.value.configuration.onDidChange;
  const installed = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
  assert.ok(installed);
  const context = {
    workspaceState: d.value.storage,
    asAbsolutePath: (path: string) => vscode.Uri.joinPath(installed.extensionUri, path).fsPath,
    globalStorageUri: vscode.Uri.joinPath(installed.extensionUri, ".vscode-test", "sessions-lifecycle"),
  } as unknown as vscode.ExtensionContext;
  try {
    const extension = new HerdrExtension(context);
    return {
      extension,
      globalStorageUri: context.globalStorageUri,
      dispose: () => {
        extension.dispose();
        Object.defineProperties(HerdrSettings.prototype, descriptors);
      },
    };
  } catch (error) {
    Object.defineProperties(HerdrSettings.prototype, descriptors);
    throw error;
  } finally {
    vscode.window.createOutputChannel = createOutputChannel;
  }
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
      let feature: ReturnType<typeof sessionBindings> | undefined;
      try {
        feature = sessionBindings(dependencies().value);
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
      const bindings = sessionBindings(d.value);
      const feature = bindings.model;
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
        bindings.dispose();
      }
      const missing = dependencies({ list: () => Promise.resolve({ kind: "missing-executable" }) as Promise<never> });
      const missingBindings = sessionBindings(missing.value);
      const missingFeature = missingBindings.model;
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
        missingBindings.dispose();
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
      const bindings = sessionBindings(value);
      const feature = bindings.model;
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
        bindings.dispose();
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
      const bindings = sessionBindings(d.value);
      const feature = bindings.model;
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
        bindings.dispose();
      }
      assert.equal(d.subscribed(), false);
      const remaining = await vscode.commands.getCommands(true);
      assert.ok(commandIds.every((id) => !remaining.includes(prefix + id)));
    });
  });

  test("Sessions View keeps all rows visible, exposes Start diagnostics, and preserves selection intent", async () => {
    await withNamespacedCommands(() => {
      const defaultSession = { id: "default", isDefault: true, availability: "running" as const };
      const workSession = { id: "work", isDefault: false, availability: "stopped" as const };
      const initial: SessionsState = {
        configuration: { executable: "herdr", session: "work" },
        catalog: { kind: "ready", sessions: [defaultSession, workSession] },
        active: { kind: "start-failed", session: workSession, diagnostic: "start denied" },
      };
      const harness = stateSource(initial);
      const view = new VsCodeSessionsView(harness.source, {
        selectSession: () => Promise.resolve(),
        refresh: () => Promise.resolve(),
      });
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
              snapshot: {
                version: "0.9.1",
                protocol: 22,
                spaces: [],
                herdrTabs: [],
                panes: [],
                layouts: [],
                agents: [],
              },
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
      return Promise.resolve();
    });
  });

  test("partial Feature command registration cleans earlier registrations and Views", async () => {
    await withNamespacedCommands(
      async (prefix, registered) => {
        const d = dependencies();
        assert.throws(() => extensionForLifecycle(d), /registration failed/);
        assert.equal(registered.length, 2);
        const remaining = await vscode.commands.getCommands(true);
        assert.ok(registered.every((id) => !remaining.includes(prefix + id)));
        assert.equal(
          remaining.some((id) => id.startsWith(prefix)),
          false,
        );
      },
      2,
      true,
    );
  });

  test("Sessions View owns its commands, routes clicks, and disposes registrations", async () => {
    await withNamespacedCommands(async (prefix, registered) => {
      const d = dependencies();
      const model = new SessionsModel(
        d.value.directory,
        d.value.connectionFactory,
        d.value.configuration,
        d.value.storage,
        d.value.logger,
      );
      const calls: string[] = [];
      const view = new VsCodeSessionsView(model, {
        selectSession: (id) => {
          calls.push(`select:${id}`);
          return Promise.resolve();
        },
        refresh: () => {
          calls.push("refresh");
          return Promise.resolve();
        },
      });
      try {
        assert.deepEqual(registered, ["herdr.selectSession", "herdr.refreshSessions"]);
        await vscode.commands.executeCommand(prefix + "herdr.selectSession", "work");
        await vscode.commands.executeCommand(prefix + "herdr.selectSession", undefined);
        await vscode.commands.executeCommand(prefix + "herdr.refreshSessions");
        assert.deepEqual(calls, ["select:work", "refresh"]);
      } finally {
        view.dispose();
        model.dispose();
      }
      const remaining = await vscode.commands.getCommands(true);
      assert.ok(registered.every((id) => !remaining.includes(prefix + id)));
    });
  });

  test("connection status owns its four commands and disposes them", async () => {
    await withNamespacedCommands(async (prefix, registered) => {
      const d = dependencies();
      const model = new SessionsModel(
        d.value.directory,
        d.value.connectionFactory,
        d.value.configuration,
        d.value.storage,
        d.value.logger,
      );
      const calls: string[] = [];
      const executeCommand = vscode.commands.executeCommand;
      vscode.commands.executeCommand = ((command: string, ...args: unknown[]) => {
        if (command === "workbench.action.openSettings") {
          assert.deepEqual(args, ["@ext:St0necrusher.vscode-herdr-extension"]);
          calls.push("open-settings");
          return Promise.resolve();
        }
        return executeCommand(command, ...args);
      }) as typeof executeCommand;
      const choose = vscode.window.showQuickPick;
      vscode.window.showQuickPick = () => Promise.resolve(undefined);
      const status = new ConnectionStatus(
        model,
        {
          refresh: () => Promise.resolve(),
          selectSession: () => Promise.resolve(),
          startSelectedSession: () => {
            calls.push("start");
            return Promise.resolve();
          },
          retry: () => {
            calls.push("retry");
            return Promise.resolve();
          },
        },
        { selectExecutable: () => Promise.resolve() },
        d.value.logger,
      );
      try {
        assert.deepEqual(registered, [
          "herdr.showStatusActions",
          "herdr.start",
          "herdr.retryDiscovery",
          "herdr.openSettings",
        ]);
        await vscode.commands.executeCommand(prefix + "herdr.start");
        await vscode.commands.executeCommand(prefix + "herdr.showStatusActions");
        await vscode.commands.executeCommand(prefix + "herdr.retryDiscovery");
        await vscode.commands.executeCommand(prefix + "herdr.openSettings");
        assert.deepEqual(calls, ["start", "retry", "open-settings"]);
      } finally {
        status.dispose();
        model.dispose();
        vscode.commands.executeCommand = executeCommand;
        vscode.window.showQuickPick = choose;
      }
      const remaining = await vscode.commands.getCommands(true);
      assert.ok(registered.every((id) => !remaining.includes(prefix + id)));
    });
  });

  test("Configure executable owns, routes, and disposes its command", async () => {
    await withNamespacedCommands(async (prefix, registered) => {
      const calls: string[] = [];
      const configure = new ConfigureExecutableFeature();
      configure.selectExecutable = () => {
        calls.push("select-executable");
        return Promise.resolve();
      };
      try {
        assert.deepEqual(registered, ["herdr.selectExecutable"]);
        await vscode.commands.executeCommand(prefix + "herdr.selectExecutable");
        assert.deepEqual(calls, ["select-executable"]);
      } finally {
        configure.dispose();
      }
      const remaining = await vscode.commands.getCommands(true);
      assert.ok(registered.every((id) => !remaining.includes(prefix + id)));
    });
  });

  test("each multi-command view cleans earlier registrations, subscriptions, and host resources on failure", async () => {
    for (const owner of ["sessions", "status"] as const) {
      await withNamespacedCommands(
        async (prefix, registered) => {
          const d = dependencies();
          const model = new SessionsModel(
            d.value.directory,
            d.value.connectionFactory,
            d.value.configuration,
            d.value.storage,
            d.value.logger,
          );
          let subscribed = false;
          const source: SessionsStateSource = {
            getState: () => model.getState(),
            onDidChange: () => {
              subscribed = true;
              return {
                dispose: () => {
                  subscribed = false;
                },
              };
            },
          };
          let hostDisposed = false;
          const registerTree = vscode.window.registerTreeDataProvider;
          const createStatus = vscode.window.createStatusBarItem;
          vscode.window.registerTreeDataProvider = <T>(id: string, provider: vscode.TreeDataProvider<T>) => {
            const registration = registerTree(id, provider);
            return {
              dispose: () => {
                hostDisposed = true;
                registration.dispose();
              },
            };
          };
          vscode.window.createStatusBarItem = ((...args: Parameters<typeof createStatus>) => {
            const status = createStatus(...args);
            const dispose = status.dispose.bind(status);
            status.dispose = () => {
              hostDisposed = true;
              dispose();
            };
            return status;
          }) as typeof createStatus;
          try {
            assert.throws(
              () =>
                owner === "sessions"
                  ? new VsCodeSessionsView(source, model)
                  : new ConnectionStatus(source, model, { selectExecutable: () => Promise.resolve() }, d.value.logger),
              /registration failed/,
            );
            assert.equal(registered.length, owner === "sessions" ? 1 : 2);
            assert.equal(subscribed, false);
            assert.equal(hostDisposed, true);
            const remaining = await vscode.commands.getCommands(true);
            assert.ok(registered.every((id) => !remaining.includes(prefix + id)));
          } finally {
            vscode.window.registerTreeDataProvider = registerTree;
            vscode.window.createStatusBarItem = createStatus;
            model.dispose();
          }
        },
        owner === "sessions" ? 1 : 2,
      );
    }
  });

  test("Connection status fails loudly when the start command cannot be registered", async () => {
    await withNamespacedCommands(async (prefix, registered) => {
      const d = dependencies();
      const model = new SessionsModel(
        d.value.directory,
        d.value.connectionFactory,
        d.value.configuration,
        d.value.storage,
        d.value.logger,
      );
      try {
        assert.throws(
          () => new ConnectionStatus(model, model, { selectExecutable: () => Promise.resolve() }, d.value.logger),
          /registration failed/,
        );
        assert.deepEqual(registered, ["herdr.showStatusActions"]);
        const remaining = await vscode.commands.getCommands(true);
        assert.ok(registered.every((id) => !remaining.includes(prefix + id)));
      } finally {
        model.dispose();
      }
    }, 1);
  });

  test("Configure executable command fails loudly when registration fails", async () => {
    await withNamespacedCommands((_prefix, registered) => {
      assert.throws(() => new ConfigureExecutableFeature(), /registration failed/);
      assert.equal(registered.length, 0);
      return Promise.resolve();
    }, 0);
  });

  test("initialization failure disposes command registrations and configuration subscription", async () => {
    await withNamespacedCommands(
      async (prefix, registered) => {
        const d = dependencies({ configurationFailure: true });
        const owner = extensionForLifecycle(d);
        const feature = owner.extension;
        try {
          await assert.rejects(feature.initialize(), /configuration subscription failed/);
          assert.equal(d.subscribed(), false);
          const remaining = await vscode.commands.getCommands(true);
          assert.ok(registered.every((id) => !remaining.includes(prefix + id)));
        } finally {
          owner.dispose();
        }
      },
      undefined,
      true,
    );
  });

  test("initialization failure stops a pending takeover plugin refresh", async () => {
    await withNamespacedCommands(
      async () => {
        const herdr = await fakeTakeoverHerdr();
        const d = dependencies({ configurationFailure: true });
        d.value.configuration.read = () => ({ executable: herdr.executable, session: "default" });
        const owner = extensionForLifecycle(d);
        const copiedPlugin = vscode.Uri.joinPath(owner.globalStorageUri, "herdr-plugin");
        try {
          await mkdir(copiedPlugin.fsPath, { recursive: true });
          await writeFile(join(copiedPlugin.fsPath, "herdr-plugin.toml"), 'version = "0.0.0-outdated"\n', "utf8");
          await assert.rejects(owner.extension.initialize(), /configuration subscription failed/);
          await herdr.answerPluginList();
          // Unstopped, the outdated plugin would be unlinked within milliseconds.
          await new Promise((resolve) => setTimeout(resolve, 500));
          assert.deepEqual(await herdr.invocations(), [["plugin", "list", "--json"]]);
        } finally {
          owner.dispose();
          await rm(copiedPlugin.fsPath, { recursive: true, force: true });
          await herdr.dispose();
        }
      },
      undefined,
      true,
    );
  });

  test("disposal before initialization prevents model initialization and command use", async () => {
    await withNamespacedCommands(
      async (prefix, registered) => {
        const d = dependencies();
        const owner = extensionForLifecycle(d);
        const feature = owner.extension;
        try {
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
        } finally {
          owner.dispose();
        }
      },
      undefined,
      true,
    );
  });
});
