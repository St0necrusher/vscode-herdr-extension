import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { startFakeHerdr } from "./fakeHerdr";

const extensionAtModuleLoad = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
assert.ok(extensionAtModuleLoad, "the real extension is installed");
assert.equal(
  extensionAtModuleLoad.isActive,
  false,
  "Composition test activation-order race: onStartupFinished activated Herdr before the test bundle installed its VS Code registration observers.",
);

// Observe host registrations, forwarding every call to VS Code unchanged. No feature or view is constructed by the test.
const providers = new Map<string, vscode.TreeDataProvider<vscode.TreeItem>>();
const statusItems: vscode.StatusBarItem[] = [];
const registerTreeDataProvider = vscode.window.registerTreeDataProvider;
const createTreeView = vscode.window.createTreeView;
const createStatusBarItem = vscode.window.createStatusBarItem;
vscode.window.registerTreeDataProvider = <T>(id: string, provider: vscode.TreeDataProvider<T>) => {
  providers.set(id, provider as vscode.TreeDataProvider<vscode.TreeItem>);
  return registerTreeDataProvider(id, provider);
};
vscode.window.createTreeView = <T>(id: string, options: vscode.TreeViewOptions<T>) => {
  providers.set(id, options.treeDataProvider as vscode.TreeDataProvider<vscode.TreeItem>);
  return createTreeView(id, options);
};
vscode.window.createStatusBarItem = (
  idOrAlignment?: string | vscode.StatusBarAlignment,
  alignmentOrPriority?: number,
  priority?: number,
) => {
  const item =
    typeof idOrAlignment === "string"
      ? createStatusBarItem(idOrAlignment, alignmentOrPriority, priority)
      : createStatusBarItem(idOrAlignment, alignmentOrPriority);
  statusItems.push(item);
  return item;
};

suite("Real Herdr extension composition", () => {
  test("connects, projects navigation, opens a Pane Editor and rebinds it after pane.moved", async () => {
    const fake = await startFakeHerdr();
    process.env.HERDR_COMPOSITION_ENDPOINT = fake.endpoint;
    try {
      const executable = vscode.workspace.getConfiguration("herdr").get<string>("executable");
      assert.ok(
        executable?.endsWith("/dist/test/extension-composition/fake-herdr.js"),
        "the workspace uses only the fake CLI",
      );
      const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
      assert.ok(extension, "the real extension is installed");
      await extension.activate();
      // Startup activation may have attempted discovery before the fixture server was ready.
      await vscode.commands.executeCommand("herdr.refreshSessions");

      const session = await waitFor(async () => {
        const rows = await children("herdr.sessions");
        return rows.find((row) => {
          const isConnectedSession = row.id === "composition" && row.description === "default · selected · connected";
          return isConnectedSession;
        });
      }, "the connected Session row");
      assert.equal(session.label, "composition");
      const status = statusItems.find((item) => item.name === "Herdr status");
      assert.ok(status, "the real composition registered its status bar item");
      assert.equal(status.accessibilityInformation?.label, "Herdr: connected");
      assert.equal(status.command, "herdr.showStatusActions");
      assert.match(tooltip(status.tooltip), /Session: `composition`/);
      assert.match(tooltip(status.tooltip), /Connected to the composition Herdr Session/);

      // Refresh resolves selection again from workspaceState. A conflicting valid preference must lose to the saved Session.
      const configuration = vscode.workspace.getConfiguration("herdr");
      await configuration.update("session", "alternate", vscode.ConfigurationTarget.Workspace);
      assert.equal(vscode.workspace.getConfiguration("herdr").get("session"), "alternate");
      await vscode.commands.executeCommand("herdr.refreshSessions");
      const persistedRows = await children("herdr.sessions");
      assert.equal(
        persistedRows.find((row) => row.id === "composition")?.description,
        "default · selected · connected",
        "the saved Session wins over the changed setting on rediscovery",
      );
      assert.equal(persistedRows.find((row) => row.id === "alternate")?.description, "stopped");

      const spaces = await children("herdr.spaces");
      assert.deepEqual(
        spaces.map((row) => row.label),
        ["Original Space", "Destination Space"],
      );
      await vscode.commands.executeCommand("herdr.selectSpace", "space-original");
      const panes = await children("herdr.panes");
      assert.equal(panes.length, 1);
      const pane = panes[0];
      assert.ok(pane);
      assert.equal(pane.id, "herdr.pane.pane-original");
      assert.equal(pane.label, "Original Tab");
      assert.equal(pane.description, "Original Pane");
      assert.equal(pane.command?.command, "herdr.openPane");
      assert.deepEqual(pane.command.arguments, ["pane-original"]);

      assert.equal(vscode.window.terminals.length, 0, "the fixture has no pre-existing terminals");
      await vscode.commands.executeCommand(pane.command.command, ...pane.command.arguments);
      const terminal = await waitFor(
        () => vscode.window.terminals.find((item) => item.name === "Original\u00a0Pane"),
        "the Pane terminal",
      );
      await waitFor(() => terminalTab("Original Pane"), "the Pane terminal editor tab");
      await waitFor(
        () => fake.clients.find((client) => client.terminalId === "terminal-original"),
        "a real Observe or Attach CLI client",
      );
      assert.equal(vscode.window.terminals.length, 1);

      fake.movePane();
      await waitFor(
        () => (terminal.name === "Moved\u00a0Pane" ? terminal : undefined),
        "the existing terminal to adopt the moved Pane name",
      );
      await waitFor(() => terminalTab("Moved Pane"), "the rebound Pane editor tab");
      await waitFor(async () => {
        const rows = await children("herdr.panes");
        return rows.find((row) => row.id === "herdr.pane.pane-moved");
      }, "navigation to follow the moved focused editor into its destination Space");
      // The new Pane identity must reveal the existing editor, rather than create a second one.
      await vscode.commands.executeCommand("herdr.openPane", "pane-moved");
      assert.equal(vscode.window.terminals.length, 1);
      assert.equal(vscode.window.terminals[0], terminal);
    } finally {
      vscode.window.registerTreeDataProvider = registerTreeDataProvider;
      vscode.window.createTreeView = createTreeView;
      vscode.window.createStatusBarItem = createStatusBarItem;
      await vscode.workspace
        .getConfiguration("herdr")
        .update("session", "composition", vscode.ConfigurationTarget.Workspace);
      vscode.window.terminals.forEach((terminal) => terminal.dispose());
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await fake.dispose();
      delete process.env.HERDR_COMPOSITION_ENDPOINT;
    }
  });
});

async function children(id: string): Promise<vscode.TreeItem[]> {
  const provider = providers.get(id);
  assert.ok(provider, `the real extension registered ${id} through the VS Code API`);
  const elements = (await provider.getChildren()) ?? [];
  return Promise.all(elements.map(async (element) => provider.getTreeItem(element)));
}

function terminalTab(label: string): vscode.Tab | undefined {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find((tab) => {
      const isPaneEditor =
        tab.input instanceof vscode.TabInputTerminal && tab.label === label.replaceAll(" ", "\u00a0");
      return isPaneEditor;
    });
}

function tooltip(value: vscode.StatusBarItem["tooltip"]): string {
  return typeof value === "string" ? value : (value?.value ?? "");
}

async function waitFor<T>(probe: () => T | undefined | Promise<T | undefined>, description: string): Promise<T> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}
