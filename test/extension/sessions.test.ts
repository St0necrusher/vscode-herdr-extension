import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { SessionsFeature } from "../../src/features/sessions/SessionsFeature.js";
import { VsCodeHerdrCommands } from "../../src/features/sessions/vscode/VsCodeHerdrCommands.js";
import type { HerdrSessionDiscovery } from "../../src/capabilities/sessions/index.js";

let sequence = 0;

// Use the real host registry/executor without colliding with the activated extension.
// Only command IDs are namespaced at the external API boundary; no production seam.
async function withCommands(
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

const ids = [
  "herdr.showStatusActions",
  "herdr.retryDiscovery",
  "herdr.start",
  "herdr.selectExecutable",
  "herdr.openSettings",
];

function dependencies() {
  const configuration = { executable: "unused-test-herdr", session: "default" };
  const calls: string[] = [];
  let subscribed = false;
  return {
    calls,
    subscribed: () => subscribed,
    value: {
      directory: {
        discover: (): Promise<HerdrSessionDiscovery> => {
          calls.push("discover");
          return Promise.resolve({ kind: "stopped", configuration });
        },
        start: () => {
          calls.push("start");
          return Promise.resolve();
        },
      },
      configuration: {
        read: () => configuration,
        onDidChange: () => {
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
      logger: {
        info: () => undefined,
        error: () => undefined,
        show: () => undefined,
      },
    },
  };
}

suite("Sessions host bindings and lifecycle", () => {
  test("constructs without registering; register binds all commands and dispose removes them", async () => {
    await withCommands(async (prefix, registered) => {
      const calls: string[] = [];
      const commands = new VsCodeHerdrCommands(
        {
          retry: () => {
            calls.push("retry");
            return Promise.resolve();
          },
          start: () => {
            calls.push("start");
            return Promise.resolve();
          },
        },
        {
          showActions: () => {
            calls.push("status");
            return Promise.resolve();
          },
        },
        {
          selectExecutable: () => {
            calls.push("select");
            return Promise.resolve();
          },
          openSettings: () => {
            calls.push("settings");
            return Promise.resolve();
          },
        },
      );
      try {
        assert.deepEqual(registered, []);
        commands.register();
        assert.deepEqual(registered, ids);
        for (const id of ids) await vscode.commands.executeCommand(prefix + id);
        assert.deepEqual(calls, [
          "status",
          "retry",
          "start",
          "select",
          "settings",
        ]);
      } finally {
        commands.dispose();
      }
      const remaining = await vscode.commands.getCommands(true);
      assert.ok(ids.every((id) => !remaining.includes(prefix + id)));
    });
  });

  test("initializes once, routes operations, and releases commands and configuration subscription", async () => {
    await withCommands(async (prefix, registered) => {
      const d = dependencies();
      const feature = new SessionsFeature(d.value);
      try {
        assert.deepEqual(registered, []);
        await Promise.all([feature.initialize(), feature.initialize()]);
        assert.deepEqual(registered, ids);
        assert.deepEqual(d.calls, ["discover"]);
        assert.equal(d.subscribed(), true);
        await vscode.commands.executeCommand(prefix + "herdr.retryDiscovery");
        await vscode.commands.executeCommand(prefix + "herdr.start");
        await vscode.commands.executeCommand(prefix + "herdr.selectExecutable");
        await vscode.commands.executeCommand(prefix + "herdr.openSettings");
        assert.deepEqual(d.calls, [
          "discover",
          "discover",
          "start",
          "discover",
          "select-executable",
          "open-settings",
        ]);
      } finally {
        feature.dispose();
      }
      assert.equal(d.subscribed(), false);
      await feature.initialize();
      assert.deepEqual(registered, ids);
      const remaining = await vscode.commands.getCommands(true);
      assert.ok(ids.every((id) => !remaining.includes(prefix + id)));
    });
  });

  test("disposal before initialization is safe and prevents registration", async () => {
    await withCommands(async (_prefix, registered) => {
      const d = dependencies();
      const feature = new SessionsFeature(d.value);
      feature.dispose();
      await feature.initialize();
      assert.deepEqual(registered, []);
      assert.deepEqual(d.calls, []);
    });
  });

  test("partial command registration failure cleans up without starting discovery", async () => {
    await withCommands(async (prefix, registered) => {
      const d = dependencies();
      const feature = new SessionsFeature(d.value);
      try {
        await assert.rejects(feature.initialize(), /registration failed/);
        assert.equal(registered.length, 2);
        assert.deepEqual(d.calls, []);
        const remaining = await vscode.commands.getCommands(true);
        assert.ok(registered.every((id) => !remaining.includes(prefix + id)));
      } finally {
        feature.dispose();
      }
    }, 2);
  });

  test("initialization failure releases commands and the configuration subscription", async () => {
    await withCommands(async (prefix, registered) => {
      const d = dependencies();
      const feature = new SessionsFeature({
        ...d.value,
        configuration: {
          ...d.value.configuration,
          read: () => {
            if (d.subscribed()) throw new Error("configuration read failed");
            return d.value.configuration.read();
          },
        },
      });
      try {
        await assert.rejects(feature.initialize(), /configuration read failed/);
        assert.equal(d.subscribed(), false);
        const remaining = await vscode.commands.getCommands(true);
        assert.ok(registered.every((id) => !remaining.includes(prefix + id)));
      } finally {
        feature.dispose();
      }
    });
  });
});
