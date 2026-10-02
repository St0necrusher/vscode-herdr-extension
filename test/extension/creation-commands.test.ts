import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type {
  ActiveSessionCreation,
  ActiveSessionProjectionSource,
  ActiveSessionProjectionState,
  CreatePaneRequest,
  CreateSpaceRequest,
  HerdrPane,
  HerdrSessionSnapshot,
  HerdrSpace,
  HerdrTab,
  SplitPaneRequest,
} from "../../src/capabilities/sessions";
import type { PaneTerminalOpenRequest } from "../../src/capabilities/terminalSurfaces";
import { NavigationFeature } from "../../src/features/navigation/NavigationFeature";
import { PanesGroupTreeItem, PaneTreeItem } from "../../src/features/navigation/panes/view/VsCodePanesView";

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

class RecordingCreation implements ActiveSessionCreation {
  readonly spaceRequests: CreateSpaceRequest[] = [];
  readonly paneRequests: CreatePaneRequest[] = [];
  readonly splitRequests: SplitPaneRequest[] = [];

  constructor(private readonly projection: MutableSessionProjection) {}

  createSpace(request: CreateSpaceRequest): Promise<{ spaceId: string; paneId: string }> {
    this.spaceRequests.push(request);
    const createdSpaceId = "space-created";
    const tabId = "tab-created-space";
    const createdPaneId = "pane-root-created";
    const current = currentConnectedProjection(this.projection);
    const createdSpace = space(createdSpaceId, current.snapshot.spaces.length + 1, "Created Space", 1, 1, tabId);
    const createdTab = tab(tabId, createdSpaceId, "Created Space Tab");
    const createdPane = pane(createdPaneId, "terminal-root-created", tabId, createdSpaceId, "Created root Pane");
    this.projection.publish({
      kind: "connected",
      sessionId: current.sessionId,
      snapshot: {
        ...current.snapshot,
        spaces: [...current.snapshot.spaces, createdSpace],
        herdrTabs: [...current.snapshot.herdrTabs, createdTab],
        panes: [...current.snapshot.panes, createdPane],
      },
    });
    return Promise.resolve({ spaceId: createdSpaceId, paneId: createdPaneId });
  }

  createPane(request: CreatePaneRequest): Promise<{ paneId: string }> {
    this.paneRequests.push(request);
    publishCreatedPane(this.projection, request);
    return Promise.resolve({ paneId: "pane-created" });
  }

  runCommand(): Promise<void> {
    return Promise.reject(new Error("not used"));
  }

  splitPane(request: SplitPaneRequest): Promise<{ paneId: string }> {
    this.splitRequests.push(request);
    const splitNumber = this.splitRequests.length;
    const current = currentConnectedProjection(this.projection);
    const targetPane = current.snapshot.panes.find((candidate) => candidate.id === request.paneId);
    assert.ok(targetPane, `The test projection contains target Pane ${request.paneId}`);
    const createdPaneId = `pane-split-${splitNumber}`;
    const createdPane = pane(
      createdPaneId,
      `terminal-split-${splitNumber}`,
      targetPane.herdrTabId,
      targetPane.spaceId,
      `Split Pane ${splitNumber}`,
    );
    publishSplitPane(this.projection, createdPane);
    return Promise.resolve({ paneId: createdPaneId });
  }
}

function currentConnectedProjection(
  projection: MutableSessionProjection,
): Extract<ActiveSessionProjectionState, { kind: "connected" }> {
  const current = projection.getActiveSessionProjection();
  assert.equal(current.kind, "connected", "Creation fakes publish only from a connected Herdr Session");
  return current;
}

function publishCreatedPane(projection: MutableSessionProjection, request: CreatePaneRequest): void {
  const current = currentConnectedProjection(projection);
  const createdPaneId = "pane-created";
  const createdTabId = "tab-created-pane";
  const createdPane = pane(createdPaneId, "terminal-created", createdTabId, request.spaceId, "Created Pane");
  const createdTab = tab(createdTabId, request.spaceId, "Created Pane Tab");
  const createdSpace = current.snapshot.spaces.find((candidate) => candidate.id === request.spaceId);
  assert.ok(createdSpace, `The test projection contains Space ${request.spaceId}`);
  const spaces = current.snapshot.spaces.map((candidate) => {
    if (candidate.id !== createdSpace.id) return candidate;
    return { ...candidate, paneCount: candidate.paneCount + 1, tabCount: candidate.tabCount + 1 };
  });
  projection.publish({
    kind: "connected",
    sessionId: current.sessionId,
    snapshot: {
      ...current.snapshot,
      spaces,
      herdrTabs: [...current.snapshot.herdrTabs, createdTab],
      panes: [...current.snapshot.panes, createdPane],
    },
  });
}

function publishSplitPane(projection: MutableSessionProjection, createdPane: HerdrPane): void {
  const current = currentConnectedProjection(projection);
  const spaces = current.snapshot.spaces.map((candidate) => {
    if (candidate.id !== createdPane.spaceId) return candidate;
    return { ...candidate, paneCount: candidate.paneCount + 1 };
  });
  const herdrTabs = current.snapshot.herdrTabs.map((candidate) => {
    if (candidate.id !== createdPane.herdrTabId) return candidate;
    return { ...candidate, paneCount: candidate.paneCount + 1 };
  });
  projection.publish({
    kind: "connected",
    sessionId: current.sessionId,
    snapshot: { ...current.snapshot, spaces, herdrTabs, panes: [...current.snapshot.panes, createdPane] },
  });
}

type ContextValueChange = Readonly<{ key: string; value: unknown }>;

type NavigationHarness = Readonly<{
  prefix: string;
  projection: MutableSessionProjection;
  creation: RecordingCreation;
  spacesProvider: vscode.TreeDataProvider<vscode.TreeItem>;
  panesProvider: vscode.TreeDataProvider<vscode.TreeItem>;
  openRequests: PaneTerminalOpenRequest[];
  errors: string[];
  contextChanges: ContextValueChange[];
  readonly workspaceFolderPickCount: number;
  setWorkspaceFolders(folders: readonly vscode.WorkspaceFolder[] | undefined): void;
  setWorkspaceFolderPickResult(folder: vscode.WorkspaceFolder | undefined): void;
}>;

async function withNavigationFeature(
  initial: ActiveSessionProjectionState,
  run: (harness: NavigationHarness) => void | Promise<void>,
): Promise<void> {
  const originalRegisterCommand = vscode.commands.registerCommand;
  const originalExecuteCommand = vscode.commands.executeCommand;
  const originalCreateTreeView = vscode.window.createTreeView;
  const originalShowErrorMessage = vscode.window.showErrorMessage;
  const originalShowWorkspaceFolderPick = vscode.window.showWorkspaceFolderPick;
  const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
  const originalWorkspaceFoldersDescriptor = Object.getOwnPropertyDescriptor(vscode.workspace, "workspaceFolders");
  const prefix = `herdr.test.creation.${++sequence}.`;
  const projection = new MutableSessionProjection(initial);
  const creation = new RecordingCreation(projection);
  const openRequests: PaneTerminalOpenRequest[] = [];
  const errors: string[] = [];
  const contextChanges: ContextValueChange[] = [];
  let workspaceFolderPickCount = 0;
  const mockTreeView = testTreeView<vscode.TreeItem>();
  let spacesProvider: vscode.TreeDataProvider<vscode.TreeItem> | undefined;
  let panesProvider: vscode.TreeDataProvider<vscode.TreeItem> | undefined;
  let pickedWorkspaceFolder: vscode.WorkspaceFolder | undefined;
  let feature: NavigationFeature | undefined;

  const setWorkspaceFolders = (folders: readonly vscode.WorkspaceFolder[] | undefined): void => {
    Object.defineProperty(vscode.workspace, "workspaceFolders", {
      configurable: true,
      enumerable: true,
      value: folders,
    });
  };

  try {
    vscode.commands.registerCommand = (...args: Parameters<typeof originalRegisterCommand>) =>
      originalRegisterCommand(prefix + args[0], args[1], args[2]);
    vscode.commands.executeCommand = ((command: string, ...args: unknown[]) => {
      if (command === "setContext") {
        contextChanges.push({ key: String(args[0]), value: args[1] });
        return Promise.resolve(undefined);
      }
      const executeOriginal = originalExecuteCommand as unknown as (
        command: string,
        ...args: unknown[]
      ) => Thenable<unknown>;
      return executeOriginal(command, ...args);
    }) as typeof originalExecuteCommand;
    vscode.window.createTreeView = <T>(viewId: string, options: vscode.TreeViewOptions<T>) => {
      if (viewId === "herdr.spaces")
        spacesProvider = options.treeDataProvider as unknown as vscode.TreeDataProvider<vscode.TreeItem>;
      else if (viewId === "herdr.panes")
        panesProvider = options.treeDataProvider as unknown as vscode.TreeDataProvider<vscode.TreeItem>;
      else assert.fail(`Unexpected Tree View ${viewId}`);
      return mockTreeView as vscode.TreeView<T>;
    };
    vscode.window.showErrorMessage = (message: string) => {
      errors.push(message);
      return Promise.resolve(undefined);
    };
    vscode.window.showWorkspaceFolderPick = () => {
      workspaceFolderPickCount += 1;
      return Promise.resolve(pickedWorkspaceFolder);
    };
    setWorkspaceFolders(originalWorkspaceFolders);

    feature = new NavigationFeature({
      sessionProjection: projection,
      paneTerminalOpening: { openPane: (request) => openRequests.push(request) },
      paneClosing: {
        closePanes: () => {
          throw new Error("not used");
        },
      },
      creation,
      management: {
        renamePane: () => Promise.reject(new Error("not used")),
        renameTab: () => Promise.reject(new Error("not used")),
        renameSpace: () => Promise.reject(new Error("not used")),
        closePane: () => Promise.reject(new Error("not used")),
        closeTab: () => Promise.reject(new Error("not used")),
        closeSpace: () => Promise.reject(new Error("not used")),
      },
    });
    assert.ok(spacesProvider);
    assert.ok(panesProvider);
    await run({
      prefix,
      projection,
      creation,
      spacesProvider,
      panesProvider,
      openRequests,
      errors,
      contextChanges,
      get workspaceFolderPickCount() {
        return workspaceFolderPickCount;
      },
      setWorkspaceFolders,
      setWorkspaceFolderPickResult: (folder) => {
        pickedWorkspaceFolder = folder;
      },
    });
  } finally {
    feature?.dispose();
    vscode.commands.registerCommand = originalRegisterCommand;
    vscode.commands.executeCommand = originalExecuteCommand;
    vscode.window.createTreeView = originalCreateTreeView;
    vscode.window.showErrorMessage = originalShowErrorMessage;
    vscode.window.showWorkspaceFolderPick = originalShowWorkspaceFolderPick;
    if (originalWorkspaceFoldersDescriptor === undefined) {
      Reflect.deleteProperty(vscode.workspace, "workspaceFolders");
    } else {
      Object.defineProperty(vscode.workspace, "workspaceFolders", originalWorkspaceFoldersDescriptor);
    }
  }
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

function space(
  id: string,
  number: number,
  label: string,
  paneCount = 1,
  tabCount = 1,
  activeHerdrTabId = `tab-${id}`,
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
  };
}

function tab(id: string, spaceId: string, label: string, paneCount = 1): HerdrTab {
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

function snapshot(
  spaces: readonly HerdrSpace[] = [space("space-a", 1, "Space A")],
  tabs: readonly HerdrTab[] = [tab("tab-a", "space-a", "Tab A")],
  panes: readonly HerdrPane[] = [pane("pane-a", "terminal-a", "tab-a", "space-a", "Pane A")],
): HerdrSessionSnapshot {
  const focusedSpaceId = spaces[0]?.id;
  return {
    version: "1",
    protocol: 1,
    spaces,
    herdrTabs: tabs,
    panes,
    layouts: [],
    agents: [],
    ...(focusedSpaceId === undefined ? {} : { focusedSpaceId }),
  };
}

function connectedProjection(currentSnapshot = snapshot()): ActiveSessionProjectionState {
  return { kind: "connected", sessionId, snapshot: currentSnapshot };
}

async function treeChildren<T extends vscode.TreeItem>(
  provider: vscode.TreeDataProvider<T>,
  element?: T,
): Promise<T[]> {
  const children = await provider.getChildren(element);
  assert.ok(children);
  return children;
}

function latestContextValue(changes: readonly ContextValueChange[], key: string): unknown {
  const matchingChanges = changes.filter((change) => change.key === key);
  assert.ok(matchingChanges.length > 0, `The context key ${key} was set`);
  const latest = matchingChanges.at(-1);
  assert.ok(latest);
  return latest.value;
}

function fixtureWorkspaceFolder(): vscode.WorkspaceFolder {
  const folders = vscode.workspace.workspaceFolders;
  assert.ok(folders);
  const folder = folders[0];
  assert.ok(folder, "The extension test workspace has one fixture folder");
  return folder;
}

function workspaceFolder(fsPath: string, name: string, index: number): vscode.WorkspaceFolder {
  return { uri: vscode.Uri.file(fsPath), name, index };
}

function isPaneTreeItemFor(item: vscode.TreeItem, paneId: string): item is PaneTreeItem {
  return item instanceof PaneTreeItem && item.paneId === paneId;
}

suite("Creation commands", () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension, "Extension is installed in the test host");
    await extension.activate();
  });

  test("New Space uses the single folder, selects the Space, and opens its root Pane", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      const fixture = fixtureWorkspaceFolder();
      await vscode.commands.executeCommand(`${harness.prefix}herdr.createSpace`);

      assert.deepEqual(harness.creation.spaceRequests, [{ sessionId, cwd: fixture.uri.fsPath }]);
      assert.equal(harness.workspaceFolderPickCount, 0);
      const spaceRows = await treeChildren(harness.spacesProvider);
      const selectedSpaces = spaceRows.filter((item) => item.contextValue === "herdr.space.selected");
      assert.deepEqual(
        selectedSpaces.map((item) => item.id),
        ["herdr.space.space-created"],
      );
      const paneRows = await treeChildren(harness.panesProvider);
      assert.ok(paneRows.some((item) => isPaneTreeItemFor(item, "pane-root-created")));
      assert.deepEqual(harness.openRequests, [
        {
          sessionId,
          paneId: "pane-root-created",
          terminalId: "terminal-root-created",
          name: "Created root Pane",
        },
      ]);
      assert.deepEqual(harness.errors, []);
    });
  });

  test("New Space uses the picked folder in a multi-root workspace", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      const fixture = fixtureWorkspaceFolder();
      const picked = workspaceFolder(`${fixture.uri.fsPath}-picked`, "Picked Folder", 1);
      harness.setWorkspaceFolders([fixture, picked]);
      harness.setWorkspaceFolderPickResult(picked);

      await vscode.commands.executeCommand(`${harness.prefix}herdr.createSpace`);

      assert.deepEqual(harness.creation.spaceRequests, [{ sessionId, cwd: picked.uri.fsPath }]);
      assert.equal(harness.workspaceFolderPickCount, 1);
      assert.deepEqual(harness.errors, []);
    });
  });

  test("New Space cancellation and no-folder workspace do not create a Space", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      const fixture = fixtureWorkspaceFolder();
      const other = workspaceFolder(`${fixture.uri.fsPath}-other`, "Other Folder", 1);
      harness.setWorkspaceFolders([fixture, other]);
      harness.setWorkspaceFolderPickResult(undefined);
      await vscode.commands.executeCommand(`${harness.prefix}herdr.createSpace`);
      assert.deepEqual(harness.creation.spaceRequests, []);
      assert.deepEqual(harness.errors, []);
      assert.equal(harness.workspaceFolderPickCount, 1);

      harness.setWorkspaceFolders(undefined);
      await vscode.commands.executeCommand(`${harness.prefix}herdr.createSpace`);
      assert.deepEqual(harness.creation.spaceRequests, []);
      assert.deepEqual(harness.errors, ["Open a folder to create a Herdr Space."]);
      assert.equal(harness.workspaceFolderPickCount, 1);
    });
  });

  test("New Pane uses the Selected Space and opens the created Pane", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      await vscode.commands.executeCommand(`${harness.prefix}herdr.createPane`);

      assert.deepEqual(harness.creation.paneRequests, [{ sessionId, spaceId: "space-a" }]);
      assert.deepEqual(harness.openRequests, [
        { sessionId, paneId: "pane-created", terminalId: "terminal-created", name: "Created Pane" },
      ]);
      const paneRows = await treeChildren(harness.panesProvider);
      assert.ok(paneRows.some((item) => isPaneTreeItemFor(item, "pane-created")));
      assert.deepEqual(harness.errors, []);
    });
  });

  test("Split Right and Split Down use Pane row items and open each created Pane", async () => {
    const groupedSnapshot = snapshot(
      [space("space-a", 1, "Space A", 2, 1, "tab-a")],
      [tab("tab-a", "space-a", "Tab A", 2)],
      [
        pane("pane-a", "terminal-a", "tab-a", "space-a", "Pane A"),
        pane("pane-b", "terminal-b", "tab-a", "space-a", "Pane B"),
      ],
    );
    await withNavigationFeature(connectedProjection(groupedSnapshot), async (harness) => {
      const paneRoots = await treeChildren(harness.panesProvider);
      const group = paneRoots.find((item) => item instanceof PanesGroupTreeItem);
      assert.ok(group);
      const rows = await treeChildren(harness.panesProvider, group);
      const paneRow = rows.find((item) => isPaneTreeItemFor(item, "pane-a"));
      assert.ok(paneRow);

      await vscode.commands.executeCommand(`${harness.prefix}herdr.splitPaneRight`, paneRow);
      await vscode.commands.executeCommand(`${harness.prefix}herdr.splitPaneDown`, paneRow);

      assert.deepEqual(harness.creation.splitRequests, [
        { sessionId, paneId: "pane-a", direction: "right" },
        { sessionId, paneId: "pane-a", direction: "down" },
      ]);
      assert.deepEqual(harness.openRequests, [
        { sessionId, paneId: "pane-split-1", terminalId: "terminal-split-1", name: "Split Pane 1" },
        { sessionId, paneId: "pane-split-2", terminalId: "terminal-split-2", name: "Split Pane 2" },
      ]);
      assert.deepEqual(harness.errors, []);
    });
  });

  test("New Pane reports an opening error when the created Pane is absent from the Session snapshot", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      harness.creation.createPane = (request) => {
        harness.creation.paneRequests.push(request);
        return Promise.resolve({ paneId: "pane-created" });
      };
      await vscode.commands.executeCommand(`${harness.prefix}herdr.createPane`);

      assert.deepEqual(harness.creation.paneRequests, [{ sessionId, spaceId: "space-a" }]);
      assert.deepEqual(harness.openRequests, []);
      assert.equal(harness.errors.length, 1);
      assert.match(harness.errors[0] ?? "", /^Pane was created but could not be opened/);
    });
  });

  test("New Pane reports a creation error when Herdr rejects the request", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      harness.creation.createPane = (request) => {
        harness.creation.paneRequests.push(request);
        return Promise.reject(new Error("server denied"));
      };
      await vscode.commands.executeCommand(`${harness.prefix}herdr.createPane`);

      assert.deepEqual(harness.creation.paneRequests, [{ sessionId, spaceId: "space-a" }]);
      assert.deepEqual(harness.openRequests, []);
      assert.deepEqual(harness.errors, ["Could not create Pane: server denied"]);
    });
  });

  test("Creation context keys follow Session freshness and Selected Space availability", async () => {
    await withNavigationFeature(connectedProjection(), (harness) => {
      const spaceKey = "herdr.spaceActionsEnabled";
      const paneKey = "herdr.paneActionsEnabled";
      assert.equal(latestContextValue(harness.contextChanges, spaceKey), true);
      assert.equal(latestContextValue(harness.contextChanges, paneKey), true);

      const current = harness.projection.getActiveSessionProjection();
      assert.equal(current.kind, "connected");
      harness.projection.publish({
        kind: "stale",
        sessionId: current.sessionId,
        reason: "reconnecting",
        snapshot: current.snapshot,
      });
      assert.equal(latestContextValue(harness.contextChanges, spaceKey), false);
      assert.equal(latestContextValue(harness.contextChanges, paneKey), false);

      harness.projection.publish(connectedProjection(snapshot([], [], [])));
      assert.equal(latestContextValue(harness.contextChanges, spaceKey), true);
      assert.equal(latestContextValue(harness.contextChanges, paneKey), false);

      harness.projection.publish({ kind: "unavailable" });
      assert.equal(latestContextValue(harness.contextChanges, spaceKey), false);
      assert.equal(latestContextValue(harness.contextChanges, paneKey), false);
    });
  });

  test("New Pane opens from the full Session snapshot after the Selected Space changes", async () => {
    const secondSpace = space("space-b", 2, "Space B");
    const secondTab = tab("tab-b", "space-b", "Tab B");
    const secondPane = pane("pane-b", "terminal-b", "tab-b", "space-b", "Pane B");
    const initialSnapshot = snapshot(
      [space("space-a", 1, "Space A"), secondSpace],
      [tab("tab-a", "space-a", "Tab A"), secondTab],
      [pane("pane-a", "terminal-a", "tab-a", "space-a", "Pane A"), secondPane],
    );
    await withNavigationFeature(connectedProjection(initialSnapshot), async (harness) => {
      let signalCreationRequestRecorded: () => void = () => undefined;
      const creationRequestRecorded = new Promise<void>((resolve) => {
        signalCreationRequestRecorded = () => resolve();
      });
      let finishPaneCreation: ((result: { paneId: string }) => void) | undefined;
      harness.creation.createPane = (request) => {
        harness.creation.paneRequests.push(request);
        signalCreationRequestRecorded();
        return new Promise((resolve) => {
          finishPaneCreation = (result) => resolve(result);
        });
      };
      const createPaneCommand = vscode.commands.executeCommand(`${harness.prefix}herdr.createPane`);
      await creationRequestRecorded;
      await vscode.commands.executeCommand(`${harness.prefix}herdr.selectSpace`, "space-b");
      publishCreatedPane(harness.projection, { sessionId, spaceId: "space-a" });
      const finishCreation = finishPaneCreation;
      assert.ok(finishCreation);
      finishCreation({ paneId: "pane-created" });
      await createPaneCommand;

      assert.deepEqual(harness.creation.paneRequests, [{ sessionId, spaceId: "space-a" }]);
      const spaceRows = await treeChildren(harness.spacesProvider);
      const selectedSpaces = spaceRows.filter((item) => item.contextValue === "herdr.space.selected");
      assert.deepEqual(
        selectedSpaces.map((item) => item.id),
        ["herdr.space.space-b"],
      );
      const paneRows = await treeChildren(harness.panesProvider);
      assert.ok(paneRows.some((item) => isPaneTreeItemFor(item, "pane-b")));
      assert.deepEqual(harness.openRequests, [
        { sessionId, paneId: "pane-created", terminalId: "terminal-created", name: "Created Pane" },
      ]);
      assert.deepEqual(harness.errors, []);
    });
  });
});
