import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { Logger } from "@core/logger";
import type { ActiveSessionProjectionState } from "../../src/modules/sessions/activeSessionProjection";
import type { ActiveSessionCreation } from "../../src/modules/sessions/creation";
import type { ActiveSessionManagement } from "../../src/modules/sessions/management";
import type { HerdrSessionSnapshot } from "../../src/api/herdr/shared/types";
import type { PaneTerminalClosing, PaneTerminalOpening } from "../../src/modules/pane-editors";
import type { PaneEditorPresence } from "../../src/modules/pane-editors/paneEditorPresence";
import type {
  ActiveSessionProjectionSource,
  PaneEditorPresenceSource,
} from "../../src/modules/workspace-context/source";
import { NavigationContextModel } from "../../src/modules/workspace-context/NavigationContextModel";
import { CloseFeature } from "../../src/features/close/CloseFeature";
import { CreatePaneFeature } from "../../src/features/create-pane/CreatePaneFeature";
import { CreateSpaceFeature } from "../../src/features/create-space/CreateSpaceFeature";
import { RenameFeature } from "../../src/features/rename/RenameFeature";
import { RevealPaneFeature } from "../../src/features/reveal-pane/RevealPaneFeature";
import { RunNpmScriptFeature } from "../../src/features/run-npm-script/RunNpmScriptFeature";
import { VsCodeNpmScriptsView } from "../../src/views/npm-scripts/VsCodeNpmScriptsView";
import { VsCodeAgentsView } from "../../src/views/sidebar/agents/VsCodeAgentsView";
import { VsCodePanesView } from "../../src/views/sidebar/panes/VsCodePanesView";
import { VsCodeSpacesView } from "../../src/views/sidebar/spaces/VsCodeSpacesView";
import { VisiblePaneEditorDecorationProvider } from "../../src/views/sidebar/shared/visiblePaneEditorDecoration";
import type { PaneAttach } from "../../src/api/herdr/pane-clients/HerdrPaneAttach";
import type { PaneClientFactory } from "../../src/api/herdr/pane-clients/HerdrPaneClientFactory";
import type { PaneObserver } from "../../src/api/herdr/pane-clients/HerdrPaneObserver";
import {
  PaneEditorFocusTracker,
  PaneEditorSelectionModel,
  PaneTerminalSurfaceManager,
  VsCodePaneTerminalSurface,
} from "../../src/modules/pane-editors";

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
      id: "tab-a2",
      spaceId: "space-a",
      number: 2,
      label: "Tab A2",
      focused: false,
      paneCount: 2,
      agentStatus: "idle",
    },
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
    ...["pane-a2", "pane-a3"].map((id) => ({
      id,
      terminalId: `terminal-${id}`,
      spaceId: "space-a",
      herdrTabId: "tab-a2",
      focused: false,
      agentStatus: "idle" as const,
      revision: 1,
      terminalTitle: id === "pane-a2" ? "Pane A2" : "Pane A3",
      stateLabels: {},
      tokens: {},
    })),
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

interface FakeTreeView {
  visible: boolean;
  readonly reveals: { id: string | undefined; options: unknown }[];
  readonly visibility: vscode.EventEmitter<vscode.TreeViewVisibilityChangeEvent>;
}

interface NavigationHarness {
  readonly prefix: string;
  readonly manager: PaneTerminalSurfaceManager;
  readonly providers: ReadonlyMap<string, vscode.TreeDataProvider<vscode.TreeItem>>;
  readonly views: ReadonlyMap<string, FakeTreeView>;
  readonly decorations: vscode.FileDecorationProvider;
  readonly decorationChanges: Set<string>;
  readonly token: vscode.CancellationToken;
  readonly initialTerminals: ReadonlySet<vscode.Terminal>;
}

let sequence = 0;
const logger: Logger = { info: () => undefined, error: () => undefined, show: () => undefined };

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

  test("R2 + R4 a focused Pane Editor reveals its Pane row, including inside a Tab group, and its Agent row", async () => {
    await withNavigationHarness(async (harness) => {
      const panes = view(harness, "herdr.panes");
      const agents = view(harness, "herdr.agents");
      const select = { select: true, focus: false };

      await vscode.commands.executeCommand(`${harness.prefix}herdr.openPane`, "pane-a2");
      await waitFor(() => panes.reveals.length > 0, "the Pane row to be revealed");
      assert.deepEqual(panes.reveals, [{ id: "herdr.pane.pane-a2", options: select }]);
      assert.deepEqual(agents.reveals, [], "a Pane without an Agent reveals no Agent row");
      const [group] = (await treeRows(harness, "herdr.panes")).filter((row) => row.id === "tab-a2");
      assert.ok(group);
      const [grouped] = (await provider(harness, "herdr.panes").getChildren(group)) ?? [];
      assert.ok(grouped);
      assert.equal((await provider(harness, "herdr.panes").getParent?.(grouped))?.id, "tab-a2");

      await vscode.commands.executeCommand(`${harness.prefix}herdr.openAgentPane`, "pane-b");
      await waitFor(() => agents.reveals.length > 0, "the Agent row to be revealed");
      assert.deepEqual(panes.reveals.at(-1), { id: "herdr.pane.pane-b", options: select });
      assert.deepEqual(agents.reveals, [{ id: "herdr.agent.pane-b", options: select }]);
    });
  });

  test("R3 a hidden view reveals nothing until it is shown, then catches up once", async () => {
    await withNavigationHarness(async (harness) => {
      const hidden = [
        { view: view(harness, "herdr.panes"), rowId: "herdr.pane.pane-b" },
        { view: view(harness, "herdr.agents"), rowId: "herdr.agent.pane-b" },
      ];
      hidden.forEach(({ view }) => (view.visible = false));

      await vscode.commands.executeCommand(`${harness.prefix}herdr.openAgentPane`, "pane-b");
      await waitForFocusedPane(harness, "pane-b");
      hidden.forEach(({ view }) => assert.deepEqual(view.reveals, []));

      hidden.forEach(({ view, rowId }) => {
        view.visible = true;
        view.visibility.fire({ visible: true });
        assert.deepEqual(view.reveals, [{ id: rowId, options: { select: true, focus: false } }]);
      });
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
  const views = new Map<string, FakeTreeView>();
  const decorationChanges = new Set<string>();
  const tokenSource = new vscode.CancellationTokenSource();
  let decorations: vscode.FileDecorationProvider | undefined;
  let decorationSubscription: vscode.Disposable | undefined;
  let decorationRegistrations = 0;
  let decorationDisposals = 0;
  let navigation: vscode.Disposable | undefined;

  try {
    vscode.commands.registerCommand = (...args: Parameters<typeof originalRegisterCommand>) =>
      originalRegisterCommand(prefix + args[0], args[1], args[2]);
    vscode.window.createTreeView = <T>(id: string, options: vscode.TreeViewOptions<T>) => {
      providers.set(id, options.treeDataProvider as vscode.TreeDataProvider<vscode.TreeItem>);
      const view: FakeTreeView = { visible: true, reveals: [], visibility: new vscode.EventEmitter() };
      views.set(id, view);
      return {
        onDidExpandElement: () => ({ dispose: () => undefined }),
        onDidCollapseElement: () => ({ dispose: () => undefined }),
        onDidChangeVisibility: view.visibility.event,
        get visible() {
          return view.visible;
        },
        reveal: (element: vscode.TreeItem, revealOptions: unknown) => {
          view.reveals.push({ id: element.id, options: revealOptions });
          return Promise.resolve();
        },
        dispose: () => view.visibility.dispose(),
        message: "",
      } as unknown as vscode.TreeView<T>;
    };
    vscode.window.registerFileDecorationProvider = (provider) => {
      decorationRegistrations++;
      decorations = provider;
      decorationSubscription = provider.onDidChangeFileDecorations?.((uris) => {
        const changed = Array.isArray(uris) ? uris : uris === undefined ? [] : [uris];
        changed.forEach((uri) => decorationChanges.add(uri.toString()));
      });
      return {
        dispose: () => {
          decorationDisposals++;
        },
      };
    };
    const unused = (): Promise<never> => Promise.reject(new Error("not used"));
    navigation = createNavigation({
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
    assert.ok(decorations, "The Visible Pane Editor decoration provider registers itself");
    assert.equal(decorationRegistrations, 1);
    await run({
      prefix,
      manager,
      providers,
      views,
      decorations,
      decorationChanges,
      token: tokenSource.token,
      initialTerminals: new Set(vscode.window.terminals),
    });
  } finally {
    decorationSubscription?.dispose();
    navigation?.dispose();
    manager.dispose();
    focusTracker.dispose();
    selection.dispose();
    tokenSource.dispose();
    vscode.commands.registerCommand = originalRegisterCommand;
    vscode.window.createTreeView = originalCreateTreeView;
    vscode.window.registerFileDecorationProvider = originalRegisterDecorations;
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  }
  assert.equal(decorationDisposals, 1);
}

type NavigationDependencies = Readonly<{
  sessionProjection: ActiveSessionProjectionSource;
  paneTerminalOpening: PaneTerminalOpening;
  paneClosing: PaneTerminalClosing;
  paneEditorPresence: PaneEditorPresenceSource;
  creation: ActiveSessionCreation;
  management: ActiveSessionManagement;
}>;

function createNavigation(dependencies: NavigationDependencies): vscode.Disposable {
  const navigationContext = new NavigationContextModel(dependencies.sessionProjection, dependencies.paneEditorPresence);
  const panes = new VsCodePanesView(
    navigationContext,
    navigationContext,
    dependencies.paneTerminalOpening,
    dependencies.management,
  );
  const spaces = new VsCodeSpacesView(navigationContext, navigationContext);
  const runNpmScript = new RunNpmScriptFeature(
    navigationContext,
    dependencies.creation,
    dependencies.paneTerminalOpening,
  );
  const npmScripts = new VsCodeNpmScriptsView(navigationContext, runNpmScript);
  const agents = new VsCodeAgentsView(navigationContext, navigationContext);
  const decorationProvider = new VisiblePaneEditorDecorationProvider(navigationContext, navigationContext);
  const createSpace = new CreateSpaceFeature(
    navigationContext,
    navigationContext,
    dependencies.creation,
    dependencies.paneTerminalOpening,
  );
  const createPane = new CreatePaneFeature(navigationContext, dependencies.creation, dependencies.paneTerminalOpening);
  const rename = new RenameFeature(navigationContext, dependencies.management);
  const close = new CloseFeature(navigationContext, dependencies.management, dependencies.paneClosing);
  const revealPane = new RevealPaneFeature(navigationContext, navigationContext, dependencies.paneTerminalOpening);

  return {
    dispose() {
      revealPane.dispose();
      close.dispose();
      rename.dispose();
      createPane.dispose();
      createSpace.dispose();
      decorationProvider.dispose();
      agents.dispose();
      npmScripts.dispose();
      runNpmScript.dispose();
      spaces.dispose();
      panes.dispose();
      navigationContext.dispose();
    },
  };
}

async function treeRows(harness: NavigationHarness, viewId: string): Promise<vscode.TreeItem[]> {
  return (await provider(harness, viewId).getChildren()) ?? [];
}

function provider(harness: NavigationHarness, viewId: string): vscode.TreeDataProvider<vscode.TreeItem> {
  const registered = harness.providers.get(viewId);
  assert.ok(registered, `${viewId} tree provider is registered`);
  return registered;
}

function view(harness: NavigationHarness, viewId: string): FakeTreeView {
  const created = harness.views.get(viewId);
  assert.ok(created, `${viewId} tree view is created`);
  return created;
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
