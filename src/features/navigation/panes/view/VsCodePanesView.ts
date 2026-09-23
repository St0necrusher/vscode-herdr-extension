import * as vscode from "vscode";
import type { PaneNavigationGroup, PaneNavigationItem, PaneNavigationRow, PanesModel, PanesState } from "../PanesModel";

export type PanesTreeItem = PanesGroupTreeItem | PaneTreeItem;

export class VsCodePanesView implements vscode.TreeDataProvider<PanesTreeItem>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<PanesTreeItem | undefined | null>();
  private readonly subscription: { dispose(): void };
  private readonly expansionSubscription: { dispose(): void };
  private readonly collapseSubscription: { dispose(): void };
  private readonly view: vscode.TreeView<PanesTreeItem>;
  private readonly expanded = new Map<string, boolean>();
  private disposed = false;
  readonly onDidChangeTreeData = this.changes.event;

  constructor(private readonly model: PanesModel) {
    this.view = vscode.window.createTreeView("herdr.panes", { treeDataProvider: this });
    this.subscription = model.onDidChange((state) => {
      setMessage(this.view, state);
      this.changes.fire(undefined);
    });
    this.expansionSubscription = this.view.onDidExpandElement((event) => {
      if (event.element instanceof PanesGroupTreeItem && event.element.id !== undefined)
        this.expanded.set(event.element.id, true);
    });
    this.collapseSubscription = this.view.onDidCollapseElement((event) => {
      if (event.element instanceof PanesGroupTreeItem && event.element.id !== undefined)
        this.expanded.set(event.element.id, false);
    });
    setMessage(this.view, model.getState());
  }

  getTreeItem(item: PanesTreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(element?: PanesTreeItem): PanesTreeItem[] {
    const state = this.model.getState();
    if (element instanceof PanesGroupTreeItem) return element.group.panes.map((pane) => new PaneTreeItem(pane));
    if (element !== undefined) return [];
    setMessage(this.view, state);
    if (state.kind === "unavailable" || state.kind === "no-space") return [];
    return state.items.map((item) => treeItem(item, this.expanded));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription.dispose();
    this.expansionSubscription.dispose();
    this.collapseSubscription.dispose();
    this.view.dispose();
    this.changes.dispose();
    this.expanded.clear();
  }
}

export class PanesGroupTreeItem extends vscode.TreeItem {
  constructor(readonly group: PaneNavigationGroup) {
    super(group.tab.label, vscode.TreeItemCollapsibleState.Expanded);
    this.id = group.tab.id;
    this.description = `${group.panes.length} ${group.panes.length === 1 ? "Pane" : "Panes"}`;
    this.contextValue = "herdr.panes.group";
    this.iconPath = new vscode.ThemeIcon("folder");
    this.tooltip = [`Herdr Tab: ${group.tab.label}`, `ID: ${group.tab.id}`, `Panes: ${group.panes.length}`].join("\n");
    this.accessibilityInformation = { label: `${group.tab.label}, ${this.description}` };
  }
}

export class PaneTreeItem extends vscode.TreeItem {
  constructor(row: PaneNavigationRow, singleton = false) {
    super(row.name, vscode.TreeItemCollapsibleState.None);
    this.id = `herdr.pane.${row.pane.id}`;
    if (singleton) this.description = row.tab.label;
    this.contextValue = singleton ? "herdr.panes.singleton" : "herdr.panes.pane";
    this.iconPath = new vscode.ThemeIcon("terminal");
    this.tooltip = [
      `Pane: ${row.name}`,
      `Pane ID: ${row.pane.id}`,
      `Terminal ID: ${row.pane.terminalId}`,
      `Herdr Tab: ${row.tab.label}`,
      `Tab ID: ${row.tab.id}`,
    ].join("\n");
    this.accessibilityInformation = {
      label: singleton ? `${row.name}, ${row.tab.label}` : row.name,
    };
  }
}

function treeItem(item: PaneNavigationItem, expanded: ReadonlyMap<string, boolean>): PanesTreeItem {
  if (item.kind === "singleton") return new PaneTreeItem(item, true);
  const group = new PanesGroupTreeItem(item);
  if (expanded.get(item.tab.id) === false) group.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
  return group;
}

function setMessage(view: vscode.TreeView<PanesTreeItem>, state: PanesState): void {
  let message: string | undefined;
  if (state.kind === "unavailable") {
    message = state.sessionId === undefined ? "No active Herdr Session" : "Herdr Session is not readable";
  } else if (state.kind === "no-space") {
    message = state.freshness === "connected" ? "Select a Space to browse Panes" : staleMessage(state.freshness.reason);
  } else if (state.kind === "stale") {
    message = staleMessage(state.reason);
  } else if (state.items.length === 0) {
    message = "No Panes in this Space";
  }
  if (message === undefined) delete view.message;
  else view.message = message;
}

function staleMessage(reason: "reconnecting" | "incompatible"): string {
  return reason === "reconnecting"
    ? "Reconnecting — showing last known state"
    : "Incompatible Session — showing last known state";
}
