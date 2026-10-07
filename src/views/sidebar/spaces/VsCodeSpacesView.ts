import * as vscode from "vscode";
import type { NavigationContextSource, SpaceSelectionOperations } from "@modules/workspace-context";
import { spaceRowUri } from "../shared";
import { SpacesModel, type SpaceNavigationEntry, type SpacesState } from "./SpacesModel";

export class VsCodeSpacesView implements vscode.TreeDataProvider<SpaceTreeItem>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<SpaceTreeItem | undefined | null>();
  private readonly subscription: { dispose(): void };
  private readonly command: vscode.Disposable;
  private readonly model: SpacesModel;
  private readonly view: vscode.TreeView<SpaceTreeItem>;
  private disposed = false;
  readonly onDidChangeTreeData = this.changes.event;

  constructor(context: NavigationContextSource, operations: SpaceSelectionOperations) {
    const model = new SpacesModel(context);
    this.model = model;
    this.view = vscode.window.createTreeView("herdr.spaces", { treeDataProvider: this });
    this.command = vscode.commands.registerCommand("herdr.selectSpace", (spaceId: unknown) => {
      if (typeof spaceId === "string") operations.selectSpace(spaceId);
    });
    this.subscription = model.onDidChange((state) => {
      setMessage(this.view, state);
      setSpaceActionsEnabled(state);
      this.changes.fire(undefined);
    });
    const state = model.getState();
    setMessage(this.view, state);
    setSpaceActionsEnabled(state);
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
    this.command.dispose();
    this.subscription.dispose();
    this.view.dispose();
    this.changes.dispose();
    this.model.dispose();
  }
}

export class SpaceTreeItem extends vscode.TreeItem {
  readonly spaceId: string;

  constructor(entry: SpaceNavigationEntry) {
    const { space } = entry;
    super(space.label, vscode.TreeItemCollapsibleState.None);
    this.id = `herdr.space.${space.id}`;
    this.description = `${space.paneCount} ${space.paneCount === 1 ? "Pane" : "Panes"} · ${space.agentStatus}`;
    const spaceContextValue = entry.selected ? "herdr.space.selected" : "herdr.space";
    this.contextValue = entry.worktreeGroup === undefined ? spaceContextValue : `${spaceContextValue}.group`;
    this.spaceId = space.id;
    this.iconPath = new vscode.ThemeIcon(entry.selected ? "pass-filled" : "circle-filled");
    this.tooltip = [
      `Space: ${space.label}`,
      `ID: ${space.id}`,
      `Panes: ${space.paneCount}`,
      `Agent state: ${space.agentStatus}`,
    ].join("\n");
    this.resourceUri = spaceRowUri(space.id);
    this.accessibilityInformation = { label: `${space.label}, ${this.description}` };
    this.command = {
      command: "herdr.selectSpace",
      title: "Select Herdr Space",
      arguments: [space.id],
    };
  }
}

function setSpaceActionsEnabled(state: SpacesState): void {
  void vscode.commands.executeCommand("setContext", "herdr.spaceActionsEnabled", state.kind === "connected");
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
