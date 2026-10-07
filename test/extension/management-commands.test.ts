import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { ActiveSessionCreation } from "../../src/modules/sessions/creation";
import type {
  ActiveSessionProjectionSource,
  ActiveSessionProjectionState,
} from "../../src/modules/sessions/activeSessionProjection";
import type {
  ActiveSessionManagement,
  ClosePaneRequest,
  CloseSpaceRequest,
  CloseTabRequest,
  MoveTabRequest,
  RenamePaneRequest,
  RenameSpaceRequest,
  RenameTabRequest,
} from "../../src/modules/sessions/management";
import type { HerdrPane, HerdrSessionSnapshot, HerdrSpace, HerdrTab } from "../../src/api/herdr/shared/types";
import type { PaneTerminalClosing, PaneTerminalOpening } from "../../src/modules/pane-editors";
import type { PaneEditorPresenceSource } from "../../src/modules/workspace-context";
import { NavigationContextModel } from "../../src/modules/workspace-context/NavigationContextModel";
import { CloseFeature } from "../../src/features/close/CloseFeature";
import { CreatePaneFeature } from "../../src/features/create-pane/CreatePaneFeature";
import { CreateSpaceFeature } from "../../src/features/create-space/CreateSpaceFeature";
import { RenameFeature } from "../../src/features/rename/RenameFeature";
import { RevealPaneFeature } from "../../src/features/reveal-pane/RevealPaneFeature";
import { RunNpmScriptFeature } from "../../src/features/run-npm-script/RunNpmScriptFeature";
import { VsCodeNpmScriptsView } from "../../src/views/npm-scripts/VsCodeNpmScriptsView";
import { VsCodeAgentsView } from "../../src/views/sidebar/agents/VsCodeAgentsView";
import { VisiblePaneEditorDecorationProvider } from "../../src/views/sidebar/shared/visiblePaneEditorDecoration";
import { PanesGroupTreeItem, PaneTreeItem, VsCodePanesView } from "../../src/views/sidebar/panes/VsCodePanesView";
import { SpaceTreeItem, VsCodeSpacesView } from "../../src/views/sidebar/spaces/VsCodeSpacesView";

const sessionId = "session-current";
let sequence = 0;

type ProjectionListener = (state: ActiveSessionProjectionState) => void;

class MutableSessionProjection implements ActiveSessionProjectionSource {
  private readonly listeners = new Set<ProjectionListener>();

  constructor(private state: ActiveSessionProjectionState) {}

  getActiveSessionProjection(): ActiveSessionProjectionState {
    return this.state;
  }

  onDidChangeActiveSessionProjection(listener: ProjectionListener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  publish(state: ActiveSessionProjectionState): void {
    this.state = state;
    [...this.listeners].forEach((listener) => listener(state));
  }
}

class RecordingManagement implements ActiveSessionManagement {
  readonly renamePaneRequests: RenamePaneRequest[] = [];
  readonly renameTabRequests: RenameTabRequest[] = [];
  readonly moveTabRequests: MoveTabRequest[] = [];
  readonly renameSpaceRequests: RenameSpaceRequest[] = [];
  readonly closePaneRequests: ClosePaneRequest[] = [];
  readonly closeTabRequests: CloseTabRequest[] = [];
  readonly closeSpaceRequests: CloseSpaceRequest[] = [];
  private nextCloseError: Error | undefined;
  private nextMoveError: Error | undefined;
  private heldMove: Readonly<{ markRequested: () => void; released: Promise<void> }> | undefined;

  constructor(private readonly projection: MutableSessionProjection) {}

  renamePane(request: RenamePaneRequest): Promise<void> {
    this.renamePaneRequests.push(request);
    const current = currentConnectedProjection(this.projection);
    const panes = current.snapshot.panes.map((pane) => {
      if (pane.id !== request.paneId) return pane;
      if (request.label !== null) return { ...pane, label: request.label };
      const paneWithoutLabel = { ...pane };
      Reflect.deleteProperty(paneWithoutLabel, "label");
      return paneWithoutLabel;
    });
    publishContents(this.projection, current.snapshot.spaces, current.snapshot.herdrTabs, panes);
    return Promise.resolve();
  }

  renameTab(request: RenameTabRequest): Promise<void> {
    this.renameTabRequests.push(request);
    const current = currentConnectedProjection(this.projection);
    const tabs = current.snapshot.herdrTabs.map((tab) =>
      tab.id === request.tabId ? { ...tab, label: request.label } : tab,
    );
    publishContents(this.projection, current.snapshot.spaces, tabs, current.snapshot.panes);
    return Promise.resolve();
  }

  // Mirrors Herdr: insertIndex is a gap in the Space's Tab order before the move.
  async moveTab(request: MoveTabRequest): Promise<void> {
    this.moveTabRequests.push(request);
    const held = this.heldMove;
    this.heldMove = undefined;
    if (held !== undefined) {
      held.markRequested();
      await held.released;
    }
    const error = this.nextMoveError;
    this.nextMoveError = undefined;
    if (error !== undefined) throw error;

    const current = currentConnectedProjection(this.projection);
    const moved = current.snapshot.herdrTabs.find((tab) => tab.id === request.tabId);
    assert.ok(moved, `The test projection contains Herdr Tab ${request.tabId}`);
    const spaceTabs = current.snapshot.herdrTabs.filter((tab) => tab.spaceId === moved.spaceId);
    const otherTabs = current.snapshot.herdrTabs.filter((tab) => tab.spaceId !== moved.spaceId);
    const before = spaceTabs.slice(0, request.insertIndex).filter((tab) => tab !== moved);
    const after = spaceTabs.slice(request.insertIndex).filter((tab) => tab !== moved);
    publishContents(
      this.projection,
      current.snapshot.spaces,
      [...otherTabs, ...before, moved, ...after],
      current.snapshot.panes,
    );
  }

  rejectNextMove(message: string): void {
    this.nextMoveError = new Error(message);
  }

  // Keeps the next move in flight, like Herdr before it publishes the new snapshot.
  holdNextMove(): Readonly<{ requested: Promise<void>; release: () => void }> {
    let markRequested = (): void => undefined;
    let release = (): void => undefined;
    const requested = new Promise<void>((resolve) => (markRequested = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    this.heldMove = { markRequested, released };
    return { requested, release };
  }

  renameSpace(request: RenameSpaceRequest): Promise<void> {
    this.renameSpaceRequests.push(request);
    const current = currentConnectedProjection(this.projection);
    const spaces = current.snapshot.spaces.map((space) =>
      space.id === request.spaceId ? { ...space, label: request.label } : space,
    );
    publishContents(this.projection, spaces, current.snapshot.herdrTabs, current.snapshot.panes);
    return Promise.resolve();
  }

  closePane(request: ClosePaneRequest): Promise<void> {
    this.closePaneRequests.push(request);
    const error = this.takeCloseError();
    if (error !== undefined) return Promise.reject(error);

    const current = currentConnectedProjection(this.projection);
    const paneExists = current.snapshot.panes.some((pane) => pane.id === request.paneId);
    assert.ok(paneExists, `The test projection contains Pane ${request.paneId}`);
    const panes = current.snapshot.panes.filter((pane) => pane.id !== request.paneId);
    publishContents(this.projection, current.snapshot.spaces, current.snapshot.herdrTabs, panes);
    return Promise.resolve();
  }

  closeTab(request: CloseTabRequest): Promise<void> {
    this.closeTabRequests.push(request);
    const error = this.takeCloseError();
    if (error !== undefined) return Promise.reject(error);

    const current = currentConnectedProjection(this.projection);
    const tabExists = current.snapshot.herdrTabs.some((tab) => tab.id === request.tabId);
    assert.ok(tabExists, `The test projection contains Herdr Tab ${request.tabId}`);
    const tabs = current.snapshot.herdrTabs.filter((tab) => tab.id !== request.tabId);
    const panes = current.snapshot.panes.filter((pane) => pane.herdrTabId !== request.tabId);
    publishContents(this.projection, current.snapshot.spaces, tabs, panes);
    return Promise.resolve();
  }

  closeSpace(request: CloseSpaceRequest): Promise<void> {
    this.closeSpaceRequests.push(request);
    const error = this.takeCloseError();
    if (error !== undefined) return Promise.reject(error);

    const current = currentConnectedProjection(this.projection);
    const target = current.snapshot.spaces.find((space) => space.id === request.spaceId);
    assert.ok(target, `The test projection contains Space ${request.spaceId}`);
    const closedSpaces = request.closeGroup
      ? current.snapshot.spaces.filter((space) => {
          const isTargetSpace = space.id === target.id;
          const hasMatchingRepositoryKey =
            target.worktree?.repositoryKey !== undefined &&
            space.worktree?.repositoryKey === target.worktree.repositoryKey;
          const shouldCloseSpace = isTargetSpace || hasMatchingRepositoryKey;
          return shouldCloseSpace;
        })
      : [target];
    const closedSpaceIds = new Set(closedSpaces.map((space) => space.id));
    const spaces = current.snapshot.spaces.filter((space) => !closedSpaceIds.has(space.id));
    const tabs = current.snapshot.herdrTabs.filter((tab) => !closedSpaceIds.has(tab.spaceId));
    const panes = current.snapshot.panes.filter((pane) => !closedSpaceIds.has(pane.spaceId));
    publishContents(this.projection, spaces, tabs, panes);
    return Promise.resolve();
  }

  rejectNextClose(message: string): void {
    this.nextCloseError = new Error(message);
  }

  private takeCloseError(): Error | undefined {
    const error = this.nextCloseError;
    this.nextCloseError = undefined;
    return error;
  }
}

type ClosedPaneEditors = Readonly<{ sessionId: string; paneIds: readonly string[] }>;

type WarningCall = Readonly<{ message: string; modal: boolean; actions: readonly string[] }>;

type NavigationHarness = Readonly<{
  prefix: string;
  projection: MutableSessionProjection;
  management: RecordingManagement;
  panesProvider: vscode.TreeDataProvider<vscode.TreeItem>;
  panesDragAndDrop: vscode.TreeDragAndDropController<vscode.TreeItem>;
  spacesProvider: vscode.TreeDataProvider<vscode.TreeItem>;
  agentsProvider: vscode.TreeDataProvider<vscode.TreeItem>;
  registeredViews: readonly string[];
  closedPaneEditors: readonly ClosedPaneEditors[];
  errors: readonly string[];
  warningCalls: readonly WarningCall[];
  setInputResult(result: string | undefined): void;
  setWarningResult(result: string | undefined): void;
}>;

async function withNavigation(
  initial: ActiveSessionProjectionState,
  run: (harness: NavigationHarness) => void | Promise<void>,
): Promise<void> {
  const originalRegisterCommand = vscode.commands.registerCommand;
  const originalExecuteCommand = vscode.commands.executeCommand;
  const originalCreateTreeView = vscode.window.createTreeView;
  const originalShowErrorMessage = vscode.window.showErrorMessage;
  const originalShowInputBox = vscode.window.showInputBox;
  const originalShowWarningMessage = vscode.window.showWarningMessage;
  const prefix = `herdr.test.management.${++sequence}.`;
  const projection = new MutableSessionProjection(initial);
  const management = new RecordingManagement(projection);
  const closedPaneEditors: ClosedPaneEditors[] = [];
  const errors: string[] = [];
  const warningCalls: WarningCall[] = [];
  const mockTreeView = testTreeView<vscode.TreeItem>();
  let panesProvider: vscode.TreeDataProvider<vscode.TreeItem> | undefined;
  let panesDragAndDrop: vscode.TreeDragAndDropController<vscode.TreeItem> | undefined;
  let spacesProvider: vscode.TreeDataProvider<vscode.TreeItem> | undefined;
  let agentsProvider: vscode.TreeDataProvider<vscode.TreeItem> | undefined;
  const registeredViews: string[] = [];
  let inputResult: string | undefined;
  let warningResult: string | undefined;
  let navigation: vscode.Disposable | undefined;

  try {
    vscode.commands.registerCommand = (...args: Parameters<typeof originalRegisterCommand>) =>
      originalRegisterCommand(prefix + args[0], args[1], args[2]);
    vscode.commands.executeCommand = ((command: string, ...args: unknown[]) => {
      if (command === "setContext") return Promise.resolve(undefined);
      const executeOriginal = originalExecuteCommand as unknown as (
        command: string,
        ...args: unknown[]
      ) => Thenable<unknown>;
      return executeOriginal(command, ...args);
    }) as typeof originalExecuteCommand;
    vscode.window.createTreeView = <T>(viewId: string, options: vscode.TreeViewOptions<T>) => {
      registeredViews.push(viewId);
      if (viewId === "herdr.panes") {
        panesProvider = options.treeDataProvider as unknown as vscode.TreeDataProvider<vscode.TreeItem>;
        panesDragAndDrop = options.dragAndDropController as unknown as
          vscode.TreeDragAndDropController<vscode.TreeItem> | undefined;
      } else if (viewId === "herdr.spaces")
        spacesProvider = options.treeDataProvider as unknown as vscode.TreeDataProvider<vscode.TreeItem>;
      else if (viewId === "herdr.agents")
        agentsProvider = options.treeDataProvider as unknown as vscode.TreeDataProvider<vscode.TreeItem>;
      else assert.fail(`Unexpected Tree View ${viewId}`);
      return mockTreeView as vscode.TreeView<T>;
    };
    vscode.window.showErrorMessage = (message: string) => {
      errors.push(message);
      return Promise.resolve(undefined);
    };
    vscode.window.showInputBox = () => Promise.resolve(inputResult);
    vscode.window.showWarningMessage = (message: string, ...items: unknown[]) => {
      const modalOptions = items.find(isModalOptions);
      const actionItems = items.filter((item): item is string => typeof item === "string");
      warningCalls.push({
        message,
        modal: modalOptions?.modal === true,
        actions: actionItems,
      });
      return Promise.resolve(warningResult);
    };

    const creation: ActiveSessionCreation = {
      createSpace: () => Promise.reject(new Error("not used")),
      createPane: () => Promise.reject(new Error("not used")),
      splitPane: () => Promise.reject(new Error("not used")),
      runCommand: () => Promise.reject(new Error("not used")),
    };
    const paneClosing: PaneTerminalClosing = {
      closePanes: (closedSessionId, paneIds) => {
        closedPaneEditors.push({ sessionId: closedSessionId, paneIds: [...paneIds] });
      },
    };
    navigation = createNavigation({
      sessionProjection: projection,
      paneEditorPresence: {
        getPaneEditorPresence: () => ({ visible: [] }),
        onDidChangePaneEditorPresence: () => ({ dispose: () => undefined }),
      },
      paneTerminalOpening: { openPane: () => undefined },
      paneClosing,
      creation,
      management,
    });
    assert.ok(panesProvider);
    assert.ok(panesDragAndDrop);
    assert.ok(spacesProvider);
    assert.ok(agentsProvider);
    await run({
      prefix,
      projection,
      management,
      panesProvider,
      panesDragAndDrop,
      spacesProvider,
      agentsProvider,
      registeredViews,
      closedPaneEditors,
      errors,
      warningCalls,
      setInputResult: (result) => {
        inputResult = result;
      },
      setWarningResult: (result) => {
        warningResult = result;
      },
    });
  } finally {
    navigation?.dispose();
    vscode.commands.registerCommand = originalRegisterCommand;
    vscode.commands.executeCommand = originalExecuteCommand;
    vscode.window.createTreeView = originalCreateTreeView;
    vscode.window.showErrorMessage = originalShowErrorMessage;
    vscode.window.showInputBox = originalShowInputBox;
    vscode.window.showWarningMessage = originalShowWarningMessage;
  }
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
  const npmScripts = new VsCodeNpmScriptsView(navigationContext);
  const runNpmScript = new RunNpmScriptFeature(
    navigationContext,
    dependencies.creation,
    dependencies.paneTerminalOpening,
    npmScripts,
  );
  const agents = new VsCodeAgentsView(navigationContext, navigationContext);
  const decorationProvider = new VisiblePaneEditorDecorationProvider(navigationContext, navigationContext);
  const decorations = vscode.window.registerFileDecorationProvider(decorationProvider);
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
      decorations.dispose();
      decorationProvider.dispose();
      agents.dispose();
      runNpmScript.dispose();
      npmScripts.dispose();
      spaces.dispose();
      panes.dispose();
      navigationContext.dispose();
    },
  };
}

function isModalOptions(item: unknown): item is vscode.MessageOptions {
  const isObject = typeof item === "object" && item !== null;
  const hasModalOption = isObject && "modal" in item;
  return hasModalOption;
}

function testTreeView<T>(): vscode.TreeView<T> {
  const disposable = { dispose: () => undefined };
  return {
    onDidExpandElement: () => disposable,
    onDidCollapseElement: () => disposable,
    onDidChangeVisibility: () => disposable,
    dispose: () => undefined,
    message: undefined,
  } as unknown as vscode.TreeView<T>;
}

function currentConnectedProjection(
  projection: MutableSessionProjection,
): Extract<ActiveSessionProjectionState, { kind: "connected" }> {
  const current = projection.getActiveSessionProjection();
  assert.equal(current.kind, "connected", "The management fake publishes only from a connected Herdr Session");
  return current;
}

function publishContents(
  projection: MutableSessionProjection,
  spaces: readonly HerdrSpace[],
  tabs: readonly HerdrTab[],
  panes: readonly HerdrPane[],
): void {
  const current = currentConnectedProjection(projection);
  const countedSpaces = spaces.map((space) => ({
    ...space,
    paneCount: panes.filter((pane) => pane.spaceId === space.id).length,
    tabCount: tabs.filter((tab) => tab.spaceId === space.id).length,
  }));
  const countedTabs = tabs.map((tab) => ({
    ...tab,
    paneCount: panes.filter((pane) => pane.herdrTabId === tab.id).length,
  }));
  projection.publish({
    ...current,
    snapshot: {
      ...current.snapshot,
      spaces: countedSpaces,
      herdrTabs: countedTabs,
      panes,
    },
  });
}

function space(
  id: string,
  number: number,
  label: string,
  paneCount: number,
  tabCount: number,
  activeHerdrTabId: string,
  worktree?: HerdrSpace["worktree"],
): HerdrSpace {
  return {
    id,
    number,
    label,
    focused: false,
    paneCount,
    tabCount,
    activeHerdrTabId,
    agentStatus: "idle",
    tokens: {},
    ...(worktree === undefined ? {} : { worktree }),
  };
}

function tab(id: string, spaceId: string, label: string, paneCount: number): HerdrTab {
  return { id, spaceId, number: 1, label, focused: false, paneCount, agentStatus: "idle" };
}

function pane(id: string, terminalId: string, tabId: string, spaceId: string, label: string): HerdrPane {
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

function snapshot(): HerdrSessionSnapshot {
  const primaryWorktree: HerdrSpace["worktree"] = {
    checkoutPath: "/repo/main",
    isLinkedWorktree: false,
    repositoryKey: "repository-main",
    repositoryName: "repository",
    repositoryRoot: "/repo",
  };
  const linkedWorktree: HerdrSpace["worktree"] = {
    checkoutPath: "/repo/feature",
    isLinkedWorktree: true,
    repositoryKey: "repository-main",
    repositoryName: "repository",
    repositoryRoot: "/repo",
  };
  return {
    version: "1",
    protocol: 1,
    spaces: [
      space("space-primary", 1, "Primary checkout", 3, 2, "tab-group", primaryWorktree),
      space("space-linked", 2, "Linked worktree", 1, 1, "tab-linked", linkedWorktree),
      space("space-other", 3, "Other repository", 1, 1, "tab-other"),
    ],
    herdrTabs: [
      tab("tab-group", "space-primary", "Grouped Herdr Tab", 2),
      tab("tab-single", "space-primary", "Singleton Herdr Tab", 1),
      tab("tab-linked", "space-linked", "Linked Herdr Tab", 1),
      tab("tab-other", "space-other", "Other Herdr Tab", 1),
    ],
    panes: [
      pane("pane-one", "terminal-one", "tab-group", "space-primary", "Pane One"),
      pane("pane-two", "terminal-two", "tab-group", "space-primary", "Pane Two"),
      pane("pane-single", "terminal-single", "tab-single", "space-primary", "Pane Single"),
      pane("pane-linked", "terminal-linked", "tab-linked", "space-linked", "Linked Pane"),
      pane("pane-other", "terminal-other", "tab-other", "space-other", "Other Pane"),
    ],
    layouts: [],
    agents: [],
    focusedSpaceId: "space-primary",
  };
}

// Adds a third, single-Pane Herdr Tab after the two in the primary Space.
function snapshotWithThreeTabs(): HerdrSessionSnapshot {
  const base = snapshot();
  const [group, single, ...otherTabs] = base.herdrTabs;
  assert.ok(group);
  assert.ok(single);
  return {
    ...base,
    herdrTabs: [group, single, tab("tab-third", "space-primary", "Third Herdr Tab", 1), ...otherTabs],
    panes: [...base.panes, pane("pane-third", "terminal-third", "tab-third", "space-primary", "Pane Third")],
  };
}

function connectedProjection(currentSnapshot = snapshot()): ActiveSessionProjectionState {
  return { kind: "connected", sessionId, snapshot: currentSnapshot };
}

function sortedIds(ids: readonly string[]): string[] {
  return [...ids].sort();
}

function closedPaneIds(calls: readonly ClosedPaneEditors[], expectedSessionId: string): readonly string[] {
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.sessionId, expectedSessionId);
  return call.paneIds;
}

async function treeChildren<T extends vscode.TreeItem>(
  provider: vscode.TreeDataProvider<T>,
  element?: T,
): Promise<T[]> {
  const children = await provider.getChildren(element);
  assert.ok(children);
  return children;
}

function isPaneTreeItemFor(item: vscode.TreeItem, paneId: string): item is PaneTreeItem {
  const isPaneRow = item instanceof PaneTreeItem;
  const hasTargetPaneId = isPaneRow && item.paneId === paneId;
  return hasTargetPaneId;
}

function isGroupTreeItemFor(item: vscode.TreeItem, tabId: string): item is PanesGroupTreeItem {
  const isGroupRow = item instanceof PanesGroupTreeItem;
  const hasTargetTabId = isGroupRow && item.group.tab.id === tabId;
  return hasTargetTabId;
}

async function dragTab(
  harness: NavigationHarness,
  source: vscode.TreeItem,
  target: vscode.TreeItem | undefined,
): Promise<void> {
  const token = new vscode.CancellationTokenSource().token;
  const dataTransfer = new vscode.DataTransfer();
  await harness.panesDragAndDrop.handleDrag?.([source], dataTransfer, token);
  await harness.panesDragAndDrop.handleDrop?.(target, dataTransfer, token);
}

function rowLabel(item: vscode.TreeItem): string | undefined {
  return typeof item.label === "string" ? item.label : item.label?.label;
}

async function rowLabels(harness: NavigationHarness, parent?: vscode.TreeItem): Promise<(string | undefined)[]> {
  const rows = await treeChildren(harness.panesProvider, parent);
  return rows.map(rowLabel);
}

async function rowLabeled(
  harness: NavigationHarness,
  label: string,
  parent?: vscode.TreeItem,
): Promise<vscode.TreeItem> {
  const rows = await treeChildren(harness.panesProvider, parent);
  const row = rows.find((item) => rowLabel(item) === label);
  assert.ok(row, `The Panes View shows a row named ${label}`);
  return row;
}

function isSpaceTreeItemFor(item: vscode.TreeItem, spaceId: string): item is SpaceTreeItem {
  const isSpaceRow = item instanceof SpaceTreeItem;
  const hasTargetSpaceId = isSpaceRow && item.spaceId === spaceId;
  return hasTargetSpaceId;
}

suite("Management commands", () => {
  test("Select Space changes the selected row and the Panes being browsed", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      await vscode.commands.executeCommand(`${harness.prefix}herdr.selectSpace`, "space-other");
      const rows = await treeChildren(harness.spacesProvider);
      const selected = rows.find((item) => isSpaceTreeItemFor(item, "space-other"));
      assert.ok(selected);
      assert.equal(selected.contextValue, "herdr.space.selected");
      assert.deepEqual(await rowLabels(harness), ["Other Herdr Tab"]);
    });
  });

  test("Rename Space sends the selected label to Herdr", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const rows = await treeChildren(harness.spacesProvider);
      const row = rows.find((item) => isSpaceTreeItemFor(item, "space-other"));
      assert.ok(row);
      harness.setInputResult("Renamed Space");
      await vscode.commands.executeCommand(`${harness.prefix}herdr.renameSpace`, row);
      assert.deepEqual(harness.management.renameSpaceRequests, [
        { sessionId, spaceId: "space-other", label: "Renamed Space" },
      ]);
      assert.deepEqual(harness.errors, []);
    });
  });

  test("Canceling Rename Space sends no request", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const rows = await treeChildren(harness.spacesProvider);
      const row = rows.find((item) => isSpaceTreeItemFor(item, "space-other"));
      assert.ok(row);
      harness.setInputResult(undefined);
      await vscode.commands.executeCommand(`${harness.prefix}herdr.renameSpace`, row);
      assert.deepEqual(harness.management.renameSpaceRequests, []);
      assert.deepEqual(harness.errors, []);
    });
  });

  test("A rejected Rename Space shows Herdr's error", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const rows = await treeChildren(harness.spacesProvider);
      const row = rows.find((item) => isSpaceTreeItemFor(item, "space-other"));
      assert.ok(row);
      harness.setInputResult("Rejected label");
      harness.management.renameSpace = (request) => {
        harness.management.renameSpaceRequests.push(request);
        return Promise.reject(new Error("server denied"));
      };
      await vscode.commands.executeCommand(`${harness.prefix}herdr.renameSpace`, row);
      assert.deepEqual(harness.management.renameSpaceRequests, [
        { sessionId, spaceId: "space-other", label: "Rejected label" },
      ]);
      assert.deepEqual(harness.errors, ["Could not rename Space: server denied"]);
    });
  });

  test("registered sidebar views and every Spaces and Panes context variant match the manifest", async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension);
    const manifest = extension.packageJSON as {
      contributes: { views: Record<string, { id: string }[]>; menus: Record<string, { when?: string }[]> };
    };
    const contributedViews = Object.values(manifest.contributes.views)
      .flat()
      .map(({ id }) => id);
    const contexts = new Map<string, Set<string>>();
    const collect = async (provider: vscode.TreeDataProvider<vscode.TreeItem>, viewId: string): Promise<void> => {
      const values = contexts.get(viewId) ?? new Set<string>();
      contexts.set(viewId, values);
      const roots = await treeChildren(provider);
      for (const root of roots) {
        if (root.contextValue !== undefined) values.add(root.contextValue);
        const children = await treeChildren(provider, root);
        children.forEach((child) => {
          if (child.contextValue !== undefined) values.add(child.contextValue);
        });
      }
    };
    const baseWithAgent = snapshot();
    const agentPane = baseWithAgent.panes[0];
    assert.ok(agentPane);
    const withAgent = {
      ...baseWithAgent,
      agents: [
        {
          ...agentPane,
          paneId: agentPane.id,
          name: "Test Agent",
          interactiveReady: true,
          launchPending: false,
          screenDetectionSkipped: false,
          stateChangeSequence: 1,
        },
      ],
    };
    await withNavigation(connectedProjection(withAgent), async (harness) => {
      harness.registeredViews.forEach((viewId) =>
        assert.ok(contributedViews.includes(viewId), `Registered view ${viewId} is contributed`),
      );
      const agents = await treeChildren(harness.agentsProvider);
      assert.equal(agents.length, 1);
      assert.equal(agents[0]?.contextValue, undefined, "Agent rows carry no menu context");
      assert.equal(agents[0]?.command?.command, "herdr.openAgentPane");
      await collect(harness.spacesProvider, "herdr.spaces");
      await collect(harness.panesProvider, "herdr.panes");
      await vscode.commands.executeCommand(`${harness.prefix}herdr.selectSpace`, "space-other");
      await collect(harness.spacesProvider, "herdr.spaces");
      await collect(harness.panesProvider, "herdr.panes");
      const base = snapshot();
      harness.projection.publish(
        connectedProjection({
          ...base,
          spaces: [space("space-primary", 1, "Primary", 2, 1, "tab-group")],
          herdrTabs: [tab("tab-group", "space-primary", "Only Tab", 2)],
          panes: base.panes.slice(0, 2),
        }),
      );
      await collect(harness.panesProvider, "herdr.panes");
    });
    contexts.forEach((values, viewId) => {
      assert.ok(contributedViews.includes(viewId));
      const patterns = (manifest.contributes.menus["view/item/context"] ?? [])
        .filter(({ when }) => when?.includes(`view == ${viewId}`))
        .map(({ when }) => when?.match(/viewItem =~ \/(.+)\//)?.[1])
        .filter((pattern): pattern is string => pattern !== undefined)
        .map((pattern) => new RegExp(pattern));
      values.forEach((value) =>
        assert.ok(
          patterns.some((pattern) => pattern.test(value)),
          `${viewId}: ${value} matches a menu`,
        ),
      );
    });
    assert.deepEqual([...(contexts.get("herdr.spaces") ?? [])].sort(), [
      "herdr.space",
      "herdr.space.group",
      "herdr.space.selected",
      "herdr.space.selected.group",
    ]);
    assert.deepEqual([...(contexts.get("herdr.panes") ?? [])].sort(), [
      "herdr.panes.group",
      "herdr.panes.group.closable",
      "herdr.panes.pane.closable",
      "herdr.panes.singleton",
      "herdr.panes.singleton.closable",
    ]);
  });

  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension, "Extension is installed in the test host");
    await extension.activate();
  });

  test("Close Pane closes only the target Pane Editor in the Selected Space", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const paneRoots = await treeChildren(harness.panesProvider);
      const groupRow = paneRoots.find((item) => isGroupTreeItemFor(item, "tab-group"));
      assert.ok(groupRow);
      const paneRows = await treeChildren(harness.panesProvider, groupRow);
      const paneRow = paneRows.find((item) => isPaneTreeItemFor(item, "pane-one"));
      assert.ok(paneRow);

      await vscode.commands.executeCommand(`${harness.prefix}herdr.closePane`, paneRow);

      assert.deepEqual(harness.management.closePaneRequests, [{ sessionId, paneId: "pane-one" }]);
      assert.deepEqual(harness.closedPaneEditors, [{ sessionId, paneIds: ["pane-one"] }]);
      assert.deepEqual(harness.errors, []);
    });
  });

  test("Close Tab closes every Pane Editor in that Herdr Tab and no others", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const paneRoots = await treeChildren(harness.panesProvider);
      const groupRow = paneRoots.find((item) => isGroupTreeItemFor(item, "tab-group"));
      assert.ok(groupRow);

      await vscode.commands.executeCommand(`${harness.prefix}herdr.closeTab`, groupRow);

      assert.deepEqual(harness.management.closeTabRequests, [{ sessionId, tabId: "tab-group" }]);
      const closedTabPanes = closedPaneIds(harness.closedPaneEditors, sessionId);
      assert.deepEqual(sortedIds(closedTabPanes), ["pane-one", "pane-two"]);
      assert.deepEqual(harness.errors, []);
    });
  });

  test("Canceling Close Space leaves its Panes and Pane Editors untouched", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const spaceRows = await treeChildren(harness.spacesProvider);
      const spaceRow = spaceRows.find((item) => isSpaceTreeItemFor(item, "space-other"));
      assert.ok(spaceRow);
      harness.setWarningResult(undefined);

      await vscode.commands.executeCommand(`${harness.prefix}herdr.closeSpace`, spaceRow);

      assert.deepEqual(harness.warningCalls, [
        { message: 'Close Space "Other repository"?', modal: true, actions: ["Close Space"] },
      ]);
      assert.deepEqual(harness.management.closeSpaceRequests, []);
      assert.deepEqual(harness.closedPaneEditors, []);
    });
  });

  test("Confirming Close Space closes only that Space's Pane Editors", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const spaceRows = await treeChildren(harness.spacesProvider);
      const spaceRow = spaceRows.find((item) => isSpaceTreeItemFor(item, "space-other"));
      assert.ok(spaceRow);
      harness.setWarningResult("Close Space");

      await vscode.commands.executeCommand(`${harness.prefix}herdr.closeSpace`, spaceRow);

      assert.deepEqual(harness.warningCalls, [
        { message: 'Close Space "Other repository"?', modal: true, actions: ["Close Space"] },
      ]);
      assert.deepEqual(harness.management.closeSpaceRequests, [
        { sessionId, spaceId: "space-other", closeGroup: false },
      ]);
      assert.deepEqual(harness.closedPaneEditors, [{ sessionId, paneIds: ["pane-other"] }]);
    });
  });

  test("Confirming Close Group closes Pane Editors for every Worktree Group member only", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const spaceRows = await treeChildren(harness.spacesProvider);
      const primarySpaceRow = spaceRows.find((item) => isSpaceTreeItemFor(item, "space-primary"));
      assert.ok(primarySpaceRow);
      harness.setWarningResult("Close Group");

      await vscode.commands.executeCommand(`${harness.prefix}herdr.closeGroup`, primarySpaceRow);

      assert.deepEqual(harness.warningCalls, [
        { message: 'Close Group "Primary checkout"?', modal: true, actions: ["Close Group"] },
      ]);
      assert.deepEqual(harness.management.closeSpaceRequests, [
        { sessionId, spaceId: "space-primary", closeGroup: true },
      ]);
      const closedGroupPanes = closedPaneIds(harness.closedPaneEditors, sessionId);
      assert.deepEqual(sortedIds(closedGroupPanes), ["pane-linked", "pane-one", "pane-single", "pane-two"]);
    });
  });

  test("A rejected close shows Herdr's error without closing Pane Editors", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const paneRoots = await treeChildren(harness.panesProvider);
      const groupRow = paneRoots.find((item) => isGroupTreeItemFor(item, "tab-group"));
      assert.ok(groupRow);
      const paneRows = await treeChildren(harness.panesProvider, groupRow);
      const paneRow = paneRows.find((item) => isPaneTreeItemFor(item, "pane-one"));
      assert.ok(paneRow);
      harness.management.rejectNextClose("server denied");

      await vscode.commands.executeCommand(`${harness.prefix}herdr.closePane`, paneRow);

      assert.deepEqual(harness.management.closePaneRequests, [{ sessionId, paneId: "pane-one" }]);
      assert.deepEqual(harness.errors, ["Could not close Pane: server denied"]);
      assert.deepEqual(harness.closedPaneEditors, []);
    });
  });

  test("Renaming a Pane with an empty name clears its label", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const paneRoots = await treeChildren(harness.panesProvider);
      const groupRow = paneRoots.find((item) => isGroupTreeItemFor(item, "tab-group"));
      assert.ok(groupRow);
      const paneRows = await treeChildren(harness.panesProvider, groupRow);
      const paneRow = paneRows.find((item) => isPaneTreeItemFor(item, "pane-one"));
      assert.ok(paneRow);
      harness.setInputResult("");

      await vscode.commands.executeCommand(`${harness.prefix}herdr.renamePane`, paneRow);

      assert.deepEqual(harness.management.renamePaneRequests, [{ sessionId, paneId: "pane-one", label: null }]);
    });
  });

  test("Canceling Rename Pane sends no request", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const paneRoots = await treeChildren(harness.panesProvider);
      const groupRow = paneRoots.find((item) => isGroupTreeItemFor(item, "tab-group"));
      assert.ok(groupRow);
      const paneRows = await treeChildren(harness.panesProvider, groupRow);
      const paneRow = paneRows.find((item) => isPaneTreeItemFor(item, "pane-one"));
      assert.ok(paneRow);
      harness.setInputResult(undefined);

      await vscode.commands.executeCommand(`${harness.prefix}herdr.renamePane`, paneRow);

      assert.deepEqual(harness.management.renamePaneRequests, []);
      assert.deepEqual(harness.errors, []);
    });
  });

  test("Rename Tab on a singleton Pane row sends that row's Herdr Tab id", async () => {
    await withNavigation(connectedProjection(), async (harness) => {
      const paneRoots = await treeChildren(harness.panesProvider);
      const paneRow = paneRoots.find((item) => isPaneTreeItemFor(item, "pane-single"));
      assert.ok(paneRow);
      harness.setInputResult("Renamed singleton Tab");

      await vscode.commands.executeCommand(`${harness.prefix}herdr.renameTab`, paneRow);

      assert.deepEqual(harness.management.renameTabRequests, [
        { sessionId, tabId: "tab-single", label: "Renamed singleton Tab" },
      ]);
    });
  });

  test("Dragging a Tab down places it after the target Tab", async () => {
    await withNavigation(connectedProjection(snapshotWithThreeTabs()), async (harness) => {
      await dragTab(
        harness,
        await rowLabeled(harness, "Grouped Herdr Tab"),
        await rowLabeled(harness, "Third Herdr Tab"),
      );

      assert.deepEqual(harness.management.moveTabRequests, [{ sessionId, tabId: "tab-group", insertIndex: 3 }]);
      assert.deepEqual(await rowLabels(harness), ["Singleton Herdr Tab", "Third Herdr Tab", "Grouped Herdr Tab"]);
    });
  });

  test("Dragging a single-Pane Tab up places it before the target Tab", async () => {
    await withNavigation(connectedProjection(snapshotWithThreeTabs()), async (harness) => {
      await dragTab(
        harness,
        await rowLabeled(harness, "Third Herdr Tab"),
        await rowLabeled(harness, "Singleton Herdr Tab"),
      );

      assert.deepEqual(harness.management.moveTabRequests, [{ sessionId, tabId: "tab-third", insertIndex: 1 }]);
      assert.deepEqual(await rowLabels(harness), ["Grouped Herdr Tab", "Third Herdr Tab", "Singleton Herdr Tab"]);
    });
  });

  test("Dropping a Tab on a Pane inside a group targets that group's Tab", async () => {
    await withNavigation(connectedProjection(snapshotWithThreeTabs()), async (harness) => {
      const paneRow = await rowLabeled(harness, "Pane Two", await rowLabeled(harness, "Grouped Herdr Tab"));

      await dragTab(harness, await rowLabeled(harness, "Third Herdr Tab"), paneRow);

      assert.deepEqual(harness.management.moveTabRequests, [{ sessionId, tabId: "tab-third", insertIndex: 0 }]);
      assert.deepEqual(await rowLabels(harness), ["Third Herdr Tab", "Grouped Herdr Tab", "Singleton Herdr Tab"]);
    });
  });

  test("Dropping a Tab on empty space moves it to the end", async () => {
    await withNavigation(connectedProjection(snapshotWithThreeTabs()), async (harness) => {
      await dragTab(harness, await rowLabeled(harness, "Singleton Herdr Tab"), undefined);

      assert.deepEqual(harness.management.moveTabRequests, [{ sessionId, tabId: "tab-single", insertIndex: 3 }]);
      assert.deepEqual(await rowLabels(harness), ["Grouped Herdr Tab", "Third Herdr Tab", "Singleton Herdr Tab"]);
    });
  });

  test("Dragging a Pane inside a group sends no move", async () => {
    await withNavigation(connectedProjection(snapshotWithThreeTabs()), async (harness) => {
      const paneRow = await rowLabeled(harness, "Pane One", await rowLabeled(harness, "Grouped Herdr Tab"));

      await dragTab(harness, paneRow, await rowLabeled(harness, "Third Herdr Tab"));

      assert.deepEqual(harness.management.moveTabRequests, []);
    });
  });

  test("Dragging a Tab in a Stale Session sends no move", async () => {
    const stale: ActiveSessionProjectionState = {
      kind: "stale",
      sessionId,
      reason: "reconnecting",
      snapshot: snapshotWithThreeTabs(),
    };
    await withNavigation(stale, async (harness) => {
      await dragTab(
        harness,
        await rowLabeled(harness, "Grouped Herdr Tab"),
        await rowLabeled(harness, "Third Herdr Tab"),
      );

      assert.deepEqual(harness.management.moveTabRequests, []);
    });
  });

  test("The Tab order changes only when Herdr publishes the move", async () => {
    await withNavigation(connectedProjection(snapshotWithThreeTabs()), async (harness) => {
      const held = harness.management.holdNextMove();

      const drop = dragTab(
        harness,
        await rowLabeled(harness, "Grouped Herdr Tab"),
        await rowLabeled(harness, "Third Herdr Tab"),
      );
      await held.requested;
      assert.deepEqual(await rowLabels(harness), ["Grouped Herdr Tab", "Singleton Herdr Tab", "Third Herdr Tab"]);

      held.release();
      await drop;
      assert.deepEqual(await rowLabels(harness), ["Singleton Herdr Tab", "Third Herdr Tab", "Grouped Herdr Tab"]);
    });
  });

  test("A rejected move shows Herdr's error and keeps the Tab order", async () => {
    await withNavigation(connectedProjection(snapshotWithThreeTabs()), async (harness) => {
      harness.management.rejectNextMove("server denied");

      await dragTab(
        harness,
        await rowLabeled(harness, "Grouped Herdr Tab"),
        await rowLabeled(harness, "Third Herdr Tab"),
      );

      assert.deepEqual(harness.errors, ["Could not move Tab: server denied"]);
      assert.deepEqual(await rowLabels(harness), ["Grouped Herdr Tab", "Singleton Herdr Tab", "Third Herdr Tab"]);
    });
  });
});
