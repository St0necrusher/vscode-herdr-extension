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
      this.changes.fire(undefined);
    });
    setMessage(this.view, model.getState());
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

function setMessage(view: vscode.TreeView<SpaceTreeItem>, state: SpacesState): void {
  const message =
    state.kind === "unavailable"
      ? state.sessionId === undefined
        ? "No active Herdr Session"
        : "Herdr Session is not readable"
      : state.kind === "stale"
        ? staleMessage(state.reason)
        : state.spaces.length === 0
          ? "No Spaces in this Herdr Session"
          : undefined;
  if (message === undefined) delete view.message;
  else view.message = message;
}

function staleMessage(reason: "reconnecting" | "incompatible"): string {
  return reason === "reconnecting"
    ? "Reconnecting — showing last known state"
    : "Incompatible Session — showing last known state";
}
