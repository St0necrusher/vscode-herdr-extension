import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { PanesFeature } from "../../src/features/navigation/panes/PanesFeature";
import type { NavigationContextSource, NavigationContextState } from "../../src/features/navigation/capabilities";
import type { HerdrPane, HerdrSessionSnapshot } from "../../src/capabilities/sessions";

let sequence = 0;

class MutableNavigationContext implements NavigationContextSource {
  private state: NavigationContextState;
  private readonly listeners = new Set<(state: NavigationContextState) => void>();

  constructor(initial: NavigationContextState) {
    this.state = initial;
  }

  getState(): NavigationContextState {
    return this.state;
  }

  onDidChange(listener: (state: NavigationContextState) => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  setState(state: NavigationContextState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener(state);
  }
}

function pane(id: string, terminalId: string, tabId: string, label: string, spaceId = "space-a"): HerdrPane {
  return {
    id,
    terminalId,
    spaceId,
    herdrTabId: tabId,
    focused: false,
    agentStatus: "idle",
    revision: 1,
    label,
    stateLabels: {},
    tokens: {},
  };
}

function navigationState(
  sessionId: string,
  panes: readonly HerdrPane[],
  freshness: "connected" | "stale" = "connected",
): NavigationContextState {
  const groupedTabs = new Set(
    panes.filter((candidate) => candidate.herdrTabId === "tab-group").map((candidate) => candidate.id),
  );
  const tabs = new Map<string, HerdrSessionSnapshot["herdrTabs"][number]>();
  for (const candidate of panes) {
    tabs.set(candidate.herdrTabId, {
      id: candidate.herdrTabId,
      spaceId: candidate.spaceId,
      number: tabs.size + 1,
      label: candidate.herdrTabId === "tab-group" ? "Grouped Tab" : "Singleton Tab",
      focused: false,
      paneCount: candidate.herdrTabId === "tab-group" ? groupedTabs.size : 1,
      agentStatus: "idle",
    });
  }
  const snapshot: HerdrSessionSnapshot = {
    version: "1",
    protocol: 1,
    spaces: [
      {
        id: "space-a",
        number: 1,
        label: "Space A",
        focused: true,
        paneCount: panes.length,
        tabCount: tabs.size,
        activeHerdrTabId: "tab-group",
        agentStatus: "idle",
        tokens: {},
      },
    ],
    herdrTabs: [...tabs.values()],
    panes,
    layouts: [],
    agents: [],
  };
  return freshness === "connected"
    ? { kind: "connected", sessionId, snapshot, selectedSpaceId: "space-a" }
    : { kind: "stale", sessionId, reason: "reconnecting", snapshot, selectedSpaceId: "space-a" };
}

function testTreeView<T>(): vscode.TreeView<T> {
  const disposable = { dispose: () => undefined };
  return {
    onDidExpandElement: () => disposable,
    onDidCollapseElement: () => disposable,
    dispose: () => undefined,
    message: undefined,
  } as unknown as vscode.TreeView<T>;
}

async function withPanesFeature(
  initial: NavigationContextState,
  run: (
    prefix: string,
    provider: vscode.TreeDataProvider<vscode.TreeItem>,
    context: MutableNavigationContext,
    requests: readonly Readonly<{ sessionId: string; paneId: string; terminalId: string; name: string }>[],
  ) => Promise<void>,
): Promise<void> {
  const originalRegisterCommand = vscode.commands.registerCommand;
  const originalCreateTreeView = vscode.window.createTreeView;
  const prefix = `herdr.test.${++sequence}.`;
  const context = new MutableNavigationContext(initial);
  const requests: { sessionId: string; paneId: string; terminalId: string; name: string }[] = [];
  let provider: vscode.TreeDataProvider<vscode.TreeItem> | undefined;
  let feature: PanesFeature | undefined;
  const mockTreeView = testTreeView<vscode.TreeItem>();

  vscode.commands.registerCommand = (...args: Parameters<typeof originalRegisterCommand>) =>
    originalRegisterCommand(prefix + args[0], args[1], args[2]);
  vscode.window.createTreeView = <T>(viewId: string, options: vscode.TreeViewOptions<T>) => {
    assert.equal(viewId, "herdr.panes");
    provider = options.treeDataProvider as vscode.TreeDataProvider<vscode.TreeItem>;
    return mockTreeView as vscode.TreeView<T>;
  };

  try {
    feature = new PanesFeature(
      context,
      {
        openPane: (request) => {
          requests.push(request);
        },
      },
      {
        createSpace: () => Promise.reject(new Error("not used")),
        createPane: () => Promise.reject(new Error("not used")),
        splitPane: () => Promise.reject(new Error("not used")),
        runCommand: () => Promise.reject(new Error("not used")),
      },
      {
        renamePane: () => Promise.reject(new Error("not used")),
        renameTab: () => Promise.reject(new Error("not used")),
        renameSpace: () => Promise.reject(new Error("not used")),
        closePane: () => Promise.reject(new Error("not used")),
        closeTab: () => Promise.reject(new Error("not used")),
        closeSpace: () => Promise.reject(new Error("not used")),
      },
      {
        closePanes: () => {
          throw new Error("not used");
        },
      },
    );
    assert.ok(provider);
    await run(prefix, provider, context, requests);
  } finally {
    feature?.dispose();
    vscode.commands.registerCommand = originalRegisterCommand;
    vscode.window.createTreeView = originalCreateTreeView;
  }
}

suite("Pane command", () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension, "Extension is installed in the test host");
    await extension.activate();
  });

  test("Pane command rereads connected and stale state, ignoring missing Panes and group headings", async () => {
    const grouped = [
      pane("pane-one", "terminal-one", "tab-group", "Pane One"),
      pane("pane-two", "terminal-two", "tab-group", "Pane Two"),
      pane("pane-single", "terminal-single", "tab-single", "Solo Pane"),
    ];
    await withPanesFeature(navigationState("session-current", grouped), async (prefix, provider, context, requests) => {
      const roots = await provider.getChildren();
      assert.ok(roots);
      const heading = roots.find((item) => item.id === "tab-group");
      assert.ok(heading);
      assert.equal(heading.command, undefined);
      const children = await provider.getChildren(heading);
      assert.ok(children);
      const paneRow = children.find((item) => item.id === "herdr.pane.pane-one");
      assert.ok(paneRow);
      const paneCommand = paneRow.command;
      assert.ok(paneCommand);
      assert.equal(paneCommand.command, "herdr.openPane");
      assert.deepEqual(paneCommand.arguments, ["pane-one"]);
      const singletonRow = roots.find((item) => item.id === "herdr.pane.pane-single");
      assert.ok(singletonRow);
      assert.equal(singletonRow.command?.command, "herdr.openPane");

      await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-one");
      assert.deepEqual(requests, [
        { sessionId: "session-current", paneId: "pane-one", terminalId: "terminal-one", name: "Pane One" },
      ]);

      await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-single");
      assert.deepEqual(requests.at(-1), {
        sessionId: "session-current",
        paneId: "pane-single",
        terminalId: "terminal-single",
        name: "Solo Pane",
      });

      context.setState(
        navigationState(
          "session-reconnected",
          [
            pane("pane-one", "terminal-current", "tab-group", "Current Pane Name"),
            pane("pane-two", "terminal-two-current", "tab-group", "Other Pane"),
          ],
          "stale",
        ),
      );
      await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-one");
      assert.deepEqual(requests.at(-1), {
        sessionId: "session-reconnected",
        paneId: "pane-one",
        terminalId: "terminal-current",
        name: "Current Pane Name",
      });

      await vscode.commands.executeCommand(prefix + "herdr.openPane", "tab-group");
      await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-missing");
      expectRequestCount(requests, 3);

      context.setState(navigationState("session-reconnected", []));
      await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-one");
      expectRequestCount(requests, 3);
    });
  });
});

function expectRequestCount(requests: readonly unknown[], expected: number): void {
  assert.equal(requests.length, expected);
}
