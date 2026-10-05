import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { HerdrLogger } from "../../src/capabilities/runtime";
import type {
  ActiveSessionProjectionSource,
  ActiveSessionProjectionState,
  HerdrSessionSnapshot,
} from "../../src/capabilities/sessions";
import type { PaneEditorPresence } from "../../src/capabilities/terminalSurfaces";
import { NavigationFeature } from "../../src/features/navigation/NavigationFeature";
import type { PaneAttach } from "../../src/infrastructure/pane-editors/HerdrPaneAttach";
import type { PaneClientFactory } from "../../src/infrastructure/pane-editors/HerdrPaneClientFactory";
import type { PaneObserver } from "../../src/infrastructure/pane-editors/HerdrPaneObserver";
import {
  PaneEditorFocusTracker,
  PaneEditorSelectionModel,
  PaneTerminalSurfaceManager,
  VsCodePaneTerminalSurface,
} from "../../src/infrastructure/pane-editors";

class FakePaneClients implements PaneClientFactory {
  createObserver(): PaneObserver {
    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    return {
      completion,
      stop: () => {
        resolveCompletion();
        return Promise.resolve();
      },
    };
  }

  createAttach(): PaneAttach {
    return { ...this.createObserver(), sendInput: () => undefined, resize: () => undefined };
  }
}

const sessionId = "agents-navigation-session";
const snapshot: HerdrSessionSnapshot = {
  version: "1",
  protocol: 1,
  focusedSpaceId: "space-a",
  spaces: [
    {
      id: "space-a",
      number: 1,
      label: "Space A",
      focused: true,
      paneCount: 1,
      tabCount: 1,
      activeHerdrTabId: "tab-a",
      agentStatus: "working",
      tokens: {},
    },
    {
      id: "space-b",
      number: 2,
      label: "Space B",
      focused: false,
      paneCount: 1,
      tabCount: 1,
      activeHerdrTabId: "tab-b",
      agentStatus: "blocked",
      tokens: {},
    },
  ],
  herdrTabs: [
    { id: "tab-a", spaceId: "space-a", number: 1, label: "Tab A", focused: true, paneCount: 1, agentStatus: "working" },
    {
      id: "tab-b",
      spaceId: "space-b",
      number: 1,
      label: "Tab B",
      focused: false,
      paneCount: 1,
      agentStatus: "blocked",
    },
  ],
  panes: [
    {
      id: "pane-a",
      terminalId: "terminal-a",
      spaceId: "space-a",
      herdrTabId: "tab-a",
      focused: true,
      agentStatus: "working",
      revision: 1,
      terminalTitle: "Pane A",
      stateLabels: {},
      tokens: {},
    },
    {
      id: "pane-b",
      terminalId: "terminal-b",
      spaceId: "space-b",
      herdrTabId: "tab-b",
      focused: false,
      agentStatus: "blocked",
      revision: 1,
      terminalTitle: "Pane B",
      stateLabels: {},
      tokens: {},
    },
  ],
  agents: [
    {
      terminalId: "terminal-a",
      paneId: "pane-a",
      spaceId: "space-a",
      herdrTabId: "tab-a",
      name: "Agent A",
      agentStatus: "working",
      focused: true,
      revision: 1,
      interactiveReady: true,
      launchPending: false,
      screenDetectionSkipped: false,
      stateChangeSequence: 1,
      stateLabels: {},
      tokens: {},
    },
    {
      terminalId: "terminal-b",
      paneId: "pane-b",
      spaceId: "space-b",
      herdrTabId: "tab-b",
      name: "Agent B",
      agentStatus: "blocked",
      focused: false,
      revision: 1,
      interactiveReady: true,
      launchPending: false,
      screenDetectionSkipped: false,
      stateChangeSequence: 1,
      stateLabels: {},
      tokens: {},
    },
  ],
  layouts: [],
};

interface NavigationHarness {
  readonly prefix: string;
  readonly manager: PaneTerminalSurfaceManager;
  readonly providers: ReadonlyMap<string, vscode.TreeDataProvider<vscode.TreeItem>>;
  readonly decorations: vscode.FileDecorationProvider;
  readonly decorationChanges: Set<string>;
  readonly token: vscode.CancellationToken;
  readonly initialTerminals: ReadonlySet<vscode.Terminal>;
}

let sequence = 0;
const logger: HerdrLogger = { info: () => undefined, error: () => undefined, show: () => undefined };

suite("Agent navigation and Visible Pane Editors", () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension, "Extension is installed in the test host");
    await extension.activate();
  });

  test("C5 + C3b selecting an Agent selects its Space, reuses its Pane Editor, and marks only Visible Pane Editors", async () => {
    await withNavigationHarness(async (harness) => {
      const [otherPane] = await treeRows(harness, "herdr.panes");
      assert.ok(otherPane);
      assert.equal(otherPane.id, "herdr.pane.pane-a", "Space A is initially the Selected Space");
      const agents = await treeRows(harness, "herdr.agents");
      const agent = agents.find((row) => row.id === "herdr.agent.pane-b");
      assert.ok(agent);
      assert.equal(agent.description, "Space B · Pane B");
      assert.equal(agent.command?.command, "herdr.openAgentPane");
      assert.deepEqual(agent.command.arguments, ["pane-b"]);
      const spaces = await treeRows(harness, "herdr.spaces");
      const space = spaces.find((row) => row.id === "herdr.space.space-b");
      assert.ok(space);

      await vscode.commands.executeCommand(harness.prefix + agent.command.command, ...agent.command.arguments);
      const located = await waitForPaneTab("Pane\u00a0B");
      await waitFor(() => located.group.activeTab === located.tab, "Agent B's Pane Editor to be visible");
      const panes = await treeRows(harness, "herdr.panes");
      assert.deepEqual(
        panes.map((row) => row.id),
        ["herdr.pane.pane-b"],
        "Space B becomes the Selected Space",
      );
      const [pane] = panes;
      assert.ok(pane);
      const markedRows = [pane, agent, space];
      await waitFor(
        () => markedRows.every((row) => harness.decorationChanges.has(rowUri(row).toString())),
        "Pane, Agent, and Space decoration change events",
      );
      for (const row of markedRows) {
        assert.ok(await harness.decorations.provideFileDecoration(rowUri(row), harness.token));
      }
      for (const row of [
        otherPane,
        ...agents.filter((row) => row !== agent),
        ...spaces.filter((row) => row !== space),
      ]) {
        assert.equal(await harness.decorations.provideFileDecoration(rowUri(row), harness.token), undefined);
      }
      assert.equal(paneTabs("Pane\u00a0B").length, 1);
      const [terminal] = createdTerminals(harness);
      assert.ok(terminal);
      assert.equal(createdTerminals(harness).length, 1);

      await vscode.commands.executeCommand(harness.prefix + agent.command.command, ...agent.command.arguments);
      assert.equal(paneTabs("Pane\u00a0B").length, 1, "selecting the Agent again reuses its Pane Editor tab");
      assert.deepEqual(createdTerminals(harness), [terminal], "selecting the Agent again reuses its terminal");

      harness.decorationChanges.clear();
      const document = await vscode.workspace.openTextDocument({
        language: "plaintext",
        content: "Hide Agent B's Pane Editor",
      });
      await vscode.window.showTextDocument(document, located.group.viewColumn);
      await waitFor(() => located.group.activeTab !== located.tab, "the text document to hide the Pane Editor");
      await waitFor(
        () => markedRows.every((row) => harness.decorationChanges.has(rowUri(row).toString())),
        "decoration change events when the Pane Editor is hidden",
      );
      for (const row of markedRows) {
        assert.equal(await harness.decorations.provideFileDecoration(rowUri(row), harness.token), undefined);
      }
    });
  });

  test("C6 Pane Editor presence follows editor groups and removes hidden or closed editors", async () => {
    await withNavigationHarness(async (harness) => {
      await vscode.commands.executeCommand(`${harness.prefix}herdr.openAgentPane`, "pane-a");
      const first = await waitForPaneTab("Pane\u00a0A");
      const document = await vscode.workspace.openTextDocument({
        language: "plaintext",
        content: "Second editor group",
      });
      await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
      await vscode.commands.executeCommand(`${harness.prefix}herdr.openAgentPane`, "pane-b");
      const second = await waitForPaneTab("Pane\u00a0B");
      assert.notStrictEqual(first.group, second.group);
      const visible = [
        { sessionId, paneId: "pane-a" },
        { sessionId, paneId: "pane-b" },
      ];
      await waitForFocusedPane(harness, "pane-b");
      assertPresence(harness, { visible, focused: { sessionId, paneId: "pane-b" } });

      await vscode.commands.executeCommand("workbench.action.focusPreviousGroup");
      await waitForFocusedPane(harness, "pane-a");
      assertPresence(harness, { visible, focused: { sessionId, paneId: "pane-a" } });
      await vscode.commands.executeCommand("workbench.action.focusNextGroup");
      await waitForFocusedPane(harness, "pane-b");
      assertPresence(harness, { visible, focused: { sessionId, paneId: "pane-b" } });

      await vscode.window.showTextDocument(document, first.group.viewColumn);
      await waitFor(() => harness.manager.getPaneEditorPresence().focused === undefined, "text editor focus");
      assertPresence(harness, { visible: [{ sessionId, paneId: "pane-b" }] });
      await vscode.window.tabGroups.close(second.tab);
      await waitFor(
        () => harness.manager.getPaneEditorPresence().visible.length === 0,
        "the remaining Pane Editor to close",
      );
      assertPresence(harness, { visible: [] });
    });
  });
});

async function withNavigationHarness(run: (harness: NavigationHarness) => Promise<void>): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  const originalRegisterCommand = vscode.commands.registerCommand;
  const originalCreateTreeView = vscode.window.createTreeView;
  const originalRegisterDecorations = vscode.window.registerFileDecorationProvider;
  const prefix = `herdr.test.agents.${++sequence}.`;
  const projectionState: ActiveSessionProjectionState = { kind: "connected", sessionId, snapshot };
  const projection: ActiveSessionProjectionSource = {
    getActiveSessionProjection: () => projectionState,
    onDidChangeActiveSessionProjection: () => ({ dispose: () => undefined }),
  };
  const selection = new PaneEditorSelectionModel();
  // Client lifecycle must not depend on whether the OS focuses the extension test window.
  const focusedWindow = { state: { focused: true }, onDidChangeWindowState: () => ({ dispose: () => undefined }) };
  const focusTracker = new PaneEditorFocusTracker(selection, focusedWindow);
  const clients = new FakePaneClients();
  const manager = new PaneTerminalSurfaceManager(
    selection,
    { subscribe: () => ({ dispose: () => undefined }) },
    {
      create: (paneSelection, viewColumn, terminalName) =>
        new VsCodePaneTerminalSurface(
          paneSelection,
          viewColumn,
          terminalName,
          projection,
          focusTracker,
          clients,
          { offer: () => ({ retract: () => undefined }) },
          logger,
        ),
    },
  );
  const providers = new Map<string, vscode.TreeDataProvider<vscode.TreeItem>>();
  const decorationChanges = new Set<string>();
  const tokenSource = new vscode.CancellationTokenSource();
  let decorations: vscode.FileDecorationProvider | undefined;
  let decorationSubscription: vscode.Disposable | undefined;
  let feature: NavigationFeature | undefined;

  try {
    vscode.commands.registerCommand = (...args: Parameters<typeof originalRegisterCommand>) =>
      originalRegisterCommand(prefix + args[0], args[1], args[2]);
    vscode.window.createTreeView = <T>(id: string, options: vscode.TreeViewOptions<T>) => {
      providers.set(id, options.treeDataProvider as vscode.TreeDataProvider<vscode.TreeItem>);
      return {
        onDidExpandElement: () => ({ dispose: () => undefined }),
        onDidCollapseElement: () => ({ dispose: () => undefined }),
        dispose: () => undefined,
        message: "",
      } as unknown as vscode.TreeView<T>;
    };
    vscode.window.registerFileDecorationProvider = (provider) => {
      decorations = provider;
      decorationSubscription = provider.onDidChangeFileDecorations?.((uris) => {
        const changed = Array.isArray(uris) ? uris : uris === undefined ? [] : [uris];
        changed.forEach((uri) => decorationChanges.add(uri.toString()));
      });
      return { dispose: () => undefined };
    };
    const unused = (): Promise<never> => Promise.reject(new Error("not used"));
    feature = new NavigationFeature({
      sessionProjection: projection,
      paneTerminalOpening: manager,
      paneEditorPresence: manager,
      paneClosing: manager,
      creation: { createSpace: unused, createPane: unused, splitPane: unused, runCommand: unused },
      management: {
        renamePane: unused,
        renameTab: unused,
        moveTab: unused,
        renameSpace: unused,
        closePane: unused,
        closeTab: unused,
        closeSpace: unused,
      },
    });
    assert.ok(decorations, "Navigation registers its Visible Pane Editor decoration provider");
    await run({
      prefix,
      manager,
      providers,
      decorations,
      decorationChanges,
      token: tokenSource.token,
      initialTerminals: new Set(vscode.window.terminals),
    });
  } finally {
    decorationSubscription?.dispose();
    feature?.dispose();
    manager.dispose();
    focusTracker.dispose();
    selection.dispose();
    tokenSource.dispose();
    vscode.commands.registerCommand = originalRegisterCommand;
    vscode.window.createTreeView = originalCreateTreeView;
    vscode.window.registerFileDecorationProvider = originalRegisterDecorations;
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  }
}

async function treeRows(harness: NavigationHarness, viewId: string): Promise<vscode.TreeItem[]> {
  const provider = harness.providers.get(viewId);
  assert.ok(provider, `${viewId} tree provider is registered`);
  return (await provider.getChildren()) ?? [];
}

function rowUri(row: vscode.TreeItem): vscode.Uri {
  assert.ok(row.resourceUri, "Navigation rows have a decoration URI");
  return row.resourceUri;
}

function paneTabs(label: string): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => {
      const matchesPaneTab = tab.label === label && tab.input instanceof vscode.TabInputTerminal;
      return matchesPaneTab;
    });
}

async function waitForPaneTab(label: string): Promise<{ tab: vscode.Tab; group: vscode.TabGroup }> {
  return waitFor(
    () =>
      vscode.window.tabGroups.all
        .flatMap((group) => group.tabs.map((tab) => ({ tab, group })))
        .find(({ tab }) => {
          const matchesPaneTab = tab.label === label && tab.input instanceof vscode.TabInputTerminal;
          return matchesPaneTab;
        }),
    `Pane Editor tab "${label}"`,
  );
}

function assertPresence(harness: NavigationHarness, expected: PaneEditorPresence): void {
  const presence = harness.manager.getPaneEditorPresence();
  assert.deepEqual(new Set(presence.visible), new Set(expected.visible));
  assert.deepEqual(presence.focused, expected.focused);
}

async function waitForFocusedPane(harness: NavigationHarness, paneId: string): Promise<void> {
  await waitFor(
    () => harness.manager.getPaneEditorPresence().focused?.paneId === paneId,
    `Pane ${paneId} to have focus`,
  );
}

function createdTerminals(harness: NavigationHarness): vscode.Terminal[] {
  return vscode.window.terminals.filter((terminal) => !harness.initialTerminals.has(terminal));
}

async function waitFor<T>(probe: () => T | undefined | false, description: string, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = probe();
    if (value) return value;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${description}`);
}
