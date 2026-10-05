import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type {
  ActiveSessionCreation,
  ActiveSessionProjectionSource,
  ActiveSessionProjectionState,
  CreatePaneRequest,
  HerdrPane,
  HerdrSessionSnapshot,
  HerdrSpace,
  HerdrTab,
  RunCommandRequest,
} from "../../src/capabilities/sessions";
import type { PaneTerminalOpenRequest } from "../../src/capabilities/terminalSurfaces";
import { NavigationFeature } from "../../src/features/navigation/NavigationFeature";

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
  readonly paneRequests: CreatePaneRequest[] = [];
  readonly runRequests: RunCommandRequest[] = [];
  runFailure: Error | undefined;

  constructor(private readonly projection: MutableSessionProjection) {}

  createSpace(): Promise<never> {
    return Promise.reject(new Error("not used"));
  }

  createPane(request: CreatePaneRequest): Promise<{ paneId: string }> {
    this.paneRequests.push(request);
    const paneId = publishScriptTab(this.projection, request, this.paneRequests.length);
    return Promise.resolve({ paneId });
  }

  splitPane(): Promise<never> {
    return Promise.reject(new Error("not used"));
  }

  runCommand(request: RunCommandRequest): Promise<void> {
    this.runRequests.push(request);
    return this.runFailure === undefined ? Promise.resolve() : Promise.reject(this.runFailure);
  }
}

// Like Herdr, a created Tab with its root Pane is in the snapshot before createPane resolves.
function publishScriptTab(projection: MutableSessionProjection, request: CreatePaneRequest, number: number): string {
  const current = projection.getActiveSessionProjection();
  assert.equal(current.kind, "connected", "Creation fakes publish only from a connected Herdr Session");
  const tabId = `tab-script-${number}`;
  const paneId = `pane-script-${number}`;
  const label = request.label ?? "Tab";
  projection.publish({
    kind: "connected",
    sessionId: current.sessionId,
    snapshot: {
      ...current.snapshot,
      herdrTabs: [...current.snapshot.herdrTabs, tab(tabId, request.spaceId, label)],
      panes: [...current.snapshot.panes, pane(paneId, `terminal-script-${number}`, tabId, request.spaceId, label)],
    },
  });
  return paneId;
}

type ScriptsHarness = Readonly<{
  prefix: string;
  projection: MutableSessionProjection;
  creation: RecordingCreation;
  openRequests: PaneTerminalOpenRequest[];
  closeRequests: string[];
  errors: string[];
}>;

async function withNavigationFeature(
  initial: ActiveSessionProjectionState,
  run: (harness: ScriptsHarness) => void | Promise<void>,
): Promise<void> {
  const originalRegisterCommand = vscode.commands.registerCommand;
  const originalExecuteCommand = vscode.commands.executeCommand;
  const originalCreateTreeView = vscode.window.createTreeView;
  const originalShowErrorMessage = vscode.window.showErrorMessage;
  const prefix = `herdr.test.scripts.${++sequence}.`;
  const projection = new MutableSessionProjection(initial);
  const creation = new RecordingCreation(projection);
  const openRequests: PaneTerminalOpenRequest[] = [];
  const closeRequests: string[] = [];
  const errors: string[] = [];
  let feature: NavigationFeature | undefined;
  const recordClose = (kind: string) => (request: unknown) => {
    closeRequests.push(`${kind} ${JSON.stringify(request)}`);
    return Promise.resolve();
  };

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
    vscode.window.createTreeView = <T>() => testTreeView<T>();
    vscode.window.showErrorMessage = (message: string) => {
      errors.push(message);
      return Promise.resolve(undefined);
    };

    feature = new NavigationFeature({
      sessionProjection: projection,
      paneEditorPresence: {
        getPaneEditorPresence: () => ({ visible: [] }),
        onDidChangePaneEditorPresence: () => ({ dispose: () => undefined }),
      },
      paneTerminalOpening: { openPane: (request) => openRequests.push(request) },
      paneClosing: {
        closePanes: (closedSessionId, paneIds) => {
          closeRequests.push(`Pane Editors ${closedSessionId} ${paneIds.join(",")}`);
        },
      },
      creation,
      management: {
        renamePane: () => Promise.reject(new Error("not used")),
        renameTab: () => Promise.reject(new Error("not used")),
        moveTab: () => Promise.reject(new Error("not used")),
        renameSpace: () => Promise.reject(new Error("not used")),
        closePane: recordClose("Pane"),
        closeTab: recordClose("Tab"),
        closeSpace: recordClose("Space"),
      },
    });
    await run({ prefix, projection, creation, openRequests, closeRequests, errors });
  } finally {
    feature?.dispose();
    vscode.commands.registerCommand = originalRegisterCommand;
    vscode.commands.executeCommand = originalExecuteCommand;
    vscode.window.createTreeView = originalCreateTreeView;
    vscode.window.showErrorMessage = originalShowErrorMessage;
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  }
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

function space(id: string, number: number, label: string): HerdrSpace {
  return {
    id,
    number,
    label,
    focused: false,
    paneCount: 1,
    tabCount: 1,
    activeHerdrTabId: `tab-${id}`,
    agentStatus: "idle",
    tokens: {},
  };
}

function tab(id: string, spaceId: string, label: string): HerdrTab {
  return { id, spaceId, number: 1, label, focused: false, paneCount: 1, agentStatus: "idle" };
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

// The fixture is a nested package; its pnpm lockfile is at the workspace folder root.
function webPackage(): Readonly<{ folder: vscode.Uri; packageJson: vscode.Uri }> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, "The extension test workspace has one fixture folder");
  const folder = vscode.Uri.joinPath(workspaceFolder.uri, "packages", "web");
  return { folder, packageJson: vscode.Uri.joinPath(folder, "package.json") };
}

// The shape of the npm extension's NpmScript tree item that the view action receives.
function npmScriptElement(script: string, packageJson: vscode.Uri): unknown {
  return {
    task: { definition: { type: "npm", script } },
    package: { resourceUri: packageJson },
  };
}

function positionOf(document: vscode.TextDocument, text: string): vscode.Position {
  const offset = document.getText().indexOf(text);
  assert.ok(offset >= 0, `The fixture package.json contains ${text}`);
  return document.positionAt(offset + 1);
}

async function runInHerdrLinks(document: vscode.TextDocument, position: vscode.Position): Promise<string[]> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    document.uri,
    position,
  );
  return hovers
    .flatMap((hover) => hover.contents)
    .filter((content) => content instanceof vscode.MarkdownString)
    .map((content) => content.value)
    .flatMap((markdown) =>
      [...markdown.matchAll(/\[Run in Herdr\]\((command:[^ )]+)/g)].map((match) => match[1] ?? ""),
    );
}

function hoverCommandArgs(link: string): unknown[] {
  const [command, query] = link.slice("command:".length).split("?");
  assert.equal(command, "herdr.runNpmScriptFromHover");
  const args: unknown = JSON.parse(decodeURIComponent(query ?? ""));
  assert.ok(Array.isArray(args));
  return args;
}

suite("Run Script in Herdr", () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension, "Extension is installed in the test host");
    await extension.activate();
    // The runner comes from the built-in npm extension; the fixture root has no package.json to activate it.
    const npm = vscode.extensions.getExtension("vscode.npm");
    assert.ok(npm, "The built-in npm extension is enabled in the test host");
    await npm.activate();
  });

  test("NPM Scripts view runs the script in a new Tab of the Selected Space and opens its Pane", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      const { folder, packageJson } = webPackage();
      const element = npmScriptElement("dev", packageJson);

      await vscode.commands.executeCommand(`${harness.prefix}herdr.runNpmScript`, element);
      await vscode.commands.executeCommand(`${harness.prefix}herdr.runNpmScript`, element);

      const request = { sessionId, spaceId: "space-a", cwd: folder.fsPath, label: "dev" };
      assert.deepEqual(harness.creation.paneRequests, [request, request]);
      assert.deepEqual(harness.creation.runRequests, [
        { sessionId, paneId: "pane-script-1", command: "pnpm run dev" },
        { sessionId, paneId: "pane-script-2", command: "pnpm run dev" },
      ]);
      assert.deepEqual(harness.openRequests, [
        { sessionId, paneId: "pane-script-1", terminalId: "terminal-script-1", name: "dev" },
        { sessionId, paneId: "pane-script-2", terminalId: "terminal-script-2", name: "dev" },
      ]);
      assert.deepEqual(harness.errors, []);
    });
  });

  test("Script names that are not shell-safe are quoted in the command", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      const { packageJson } = webPackage();

      await vscode.commands.executeCommand(
        `${harness.prefix}herdr.runNpmScript`,
        npmScriptElement("say 'hi'", packageJson),
      );

      assert.deepEqual(
        harness.creation.runRequests.map((request) => request.command),
        [`pnpm run 'say '\\''hi'\\'''`],
      );
      assert.deepEqual(harness.errors, []);
    });
  });

  test("package.json hover offers Run in Herdr while connected and its link runs the script", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      const { folder, packageJson } = webPackage();
      const document = await vscode.workspace.openTextDocument(packageJson);
      const scriptName = positionOf(document, '"build:prod"');

      const links = await runInHerdrLinks(document, scriptName);
      assert.equal(links.length, 1);
      await vscode.commands.executeCommand(
        `${harness.prefix}herdr.runNpmScriptFromHover`,
        ...hoverCommandArgs(links[0] ?? ""),
      );

      assert.deepEqual(harness.creation.paneRequests, [
        { sessionId, spaceId: "space-a", cwd: folder.fsPath, label: "build:prod" },
      ]);
      assert.deepEqual(harness.creation.runRequests, [
        { sessionId, paneId: "pane-script-1", command: "pnpm run build:prod" },
      ]);
      assert.deepEqual(
        harness.openRequests.map((request) => request.paneId),
        ["pane-script-1"],
      );
      assert.deepEqual(harness.errors, []);

      harness.projection.publish({ kind: "stale", sessionId, reason: "reconnecting", snapshot: snapshot() });
      assert.deepEqual(await runInHerdrLinks(document, scriptName), []);
    });
  });

  test("package.json editor menu runs the script whose command is at the cursor", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      const { folder, packageJson } = webPackage();
      const editor = await vscode.window.showTextDocument(packageJson);
      const scriptCommand = positionOf(editor.document, '"vite build"');
      editor.selection = new vscode.Selection(scriptCommand, scriptCommand);

      await vscode.commands.executeCommand(`${harness.prefix}herdr.runNpmScriptAtCursor`);

      assert.deepEqual(harness.creation.paneRequests, [
        { sessionId, spaceId: "space-a", cwd: folder.fsPath, label: "build:prod" },
      ]);
      assert.deepEqual(harness.creation.runRequests, [
        { sessionId, paneId: "pane-script-1", command: "pnpm run build:prod" },
      ]);
      assert.deepEqual(
        harness.openRequests.map((request) => request.paneId),
        ["pane-script-1"],
      );
      assert.deepEqual(harness.errors, []);
    });
  });

  test("A script that cannot be started keeps its Tab and opens no Pane Editor", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      const { packageJson } = webPackage();
      harness.creation.runFailure = new Error("pane is gone");

      await vscode.commands.executeCommand(`${harness.prefix}herdr.runNpmScript`, npmScriptElement("dev", packageJson));

      assert.equal(harness.creation.paneRequests.length, 1);
      assert.equal(harness.creation.runRequests.length, 1);
      assert.deepEqual(harness.openRequests, []);
      assert.deepEqual(harness.closeRequests, []);
      assert.equal(harness.errors.length, 1);
      assert.match(harness.errors[0] ?? "", /^Herdr Tab was created but the script could not be started/);
    });
  });

  test("Without a Selected Space the script is not run", async () => {
    await withNavigationFeature(connectedProjection(snapshot([], [], [])), async (harness) => {
      const { packageJson } = webPackage();

      await vscode.commands.executeCommand(`${harness.prefix}herdr.runNpmScript`, npmScriptElement("dev", packageJson));

      assert.deepEqual(harness.creation.paneRequests, []);
      assert.deepEqual(harness.creation.runRequests, []);
      assert.equal(harness.errors.length, 1);
    });
  });

  test("An NPM Scripts item of an unexpected shape is not run", async () => {
    await withNavigationFeature(connectedProjection(), async (harness) => {
      await vscode.commands.executeCommand(`${harness.prefix}herdr.runNpmScript`, { label: "dev" });

      assert.deepEqual(harness.creation.paneRequests, []);
      assert.deepEqual(harness.creation.runRequests, []);
      assert.equal(harness.errors.length, 1);
    });
  });
});
