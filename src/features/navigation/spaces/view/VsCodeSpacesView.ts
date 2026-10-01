import * as vscode from "vscode";
import type { SpaceNavigationEntry, SpacesModel, SpacesState } from "../SpacesModel";

export class VsCodeSpacesView implements vscode.TreeDataProvider<SpaceTreeItem>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<SpaceTreeItem | undefined | null>();
  private readonly subscription: { dispose(): void };
  private readonly view: vscode.TreeView<SpaceTreeItem>;
  private disposed = false;
  readonly onDidChangeTreeData = this.changes.event;

  constructor(private readonly model: SpacesModel) {
    this.view = vscode.window.createTreeView("herdr.spaces", { treeDataProvider: this });
    this.subscription = model.onDidChange((state) => {
      setMessage(this.view, state);
      setSpaceCreationEnabled(state);
      this.changes.fire(undefined);
    });
    const state = model.getState();
    setMessage(this.view, state);
    setSpaceCreationEnabled(state);
  }

  async chooseSpaceFolder(): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length === 0) {
      void vscode.window.showErrorMessage("Open a folder to create a Herdr Space.");
      return undefined;
    }
    if (workspaceFolders.length === 1) return workspaceFolders[0]?.uri.fsPath;

    const selected = await vscode.window.showWorkspaceFolderPick({
      placeHolder: "Choose a folder for the new Herdr Space",
    });
    return selected?.uri.fsPath;
  }

  showSpaceCreationError(error: unknown): void {
    void vscode.window.showErrorMessage(`Could not create Space: ${errorMessage(error)}`);
  }

  showCreatedSpaceOpenError(error: unknown): void {
    void vscode.window.showErrorMessage(`Space was created but its Pane could not be opened: ${errorMessage(error)}`);
  }

  getTreeItem(item: SpaceTreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(element?: SpaceTreeItem): SpaceTreeItem[] {
    if (element !== undefined) return [];
    const state = this.model.getState();
    setMessage(this.view, state);
    if (state.kind === "unavailable") return [];
    return state.spaces.map((entry) => new SpaceTreeItem(entry));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription.dispose();
    this.view.dispose();
    this.changes.dispose();
  }
}

export class SpaceTreeItem extends vscode.TreeItem {
  constructor(entry: SpaceNavigationEntry) {
    const { space } = entry;
    super(space.label, vscode.TreeItemCollapsibleState.None);
    this.id = `herdr.space.${space.id}`;
    this.description = `${space.paneCount} ${space.paneCount === 1 ? "Pane" : "Panes"} · ${space.agentStatus}`;
    this.contextValue = entry.selected ? "herdr.space.selected" : "herdr.space";
    this.iconPath = new vscode.ThemeIcon(entry.selected ? "pass-filled" : "circle-filled");
    this.tooltip = [
      `Space: ${space.label}`,
      `ID: ${space.id}`,
      `Panes: ${space.paneCount}`,
      `Agent state: ${space.agentStatus}`,
    ].join("\n");
    this.accessibilityInformation = { label: `${space.label}, ${this.description}` };
    this.command = {
      command: "herdr.selectSpace",
      title: "Select Herdr Space",
      arguments: [space.id],
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setSpaceCreationEnabled(state: SpacesState): void {
  void vscode.commands.executeCommand("setContext", "herdr.spaceCreationEnabled", state.kind === "connected");
}

function setMessage(view: vscode.TreeView<SpaceTreeItem>, state: SpacesState): void {
  const message =
    state.kind === "unavailable"
      ? "Herdr Session is not connected"
      : state.spaces.length === 0
        ? "No Spaces in this Herdr Session"
        : undefined;
  // Assign rather than delete: TreeView.message is an accessor, and VS Code clears it with "".
  view.message = message ?? "";
}
