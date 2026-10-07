import * as vscode from "vscode";
import type {
  PaneNavigationGroup,
  PaneNavigationItem,
  PaneNavigationRow,
  PaneNavigationSingleton,
  PanesModel,
  PanesState,
} from "../PanesModel";
import type { VisiblePaneEditorsSource } from "@modules/workspace-context";
import { paneRowUri } from "../../shared/view";

export type PanesTreeItem = PanesGroupTreeItem | PaneTreeItem;

type TabMove = (tabId: string, targetTabId: string | undefined) => Promise<void>;

const tabMimeType = "application/vnd.herdr.tab";
// VS Code delivers drops from a tree, including this one, only when its own mime type is accepted.
const panesTreeMimeType = "application/vnd.code.tree.herdr.panes";

export class VsCodePanesView implements vscode.TreeDataProvider<PanesTreeItem>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<PanesTreeItem | undefined | null>();
  private readonly subscription: { dispose(): void };
  private readonly expansionSubscription: { dispose(): void };
  private readonly collapseSubscription: { dispose(): void };
  private readonly focusSubscription: { dispose(): void };
  private readonly visibilitySubscription: { dispose(): void };
  private readonly view: vscode.TreeView<PanesTreeItem>;
  private readonly expanded = new Map<string, boolean>();
  private disposed = false;
  readonly onDidChangeTreeData = this.changes.event;

  constructor(
    private readonly model: PanesModel,
    private readonly paneEditors: VisiblePaneEditorsSource,
    moveTab: TabMove,
  ) {
    this.view = vscode.window.createTreeView("herdr.panes", {
      treeDataProvider: this,
      dragAndDropController: new TabDragAndDropController(moveTab),
    });
    this.subscription = model.onDidChange((state) => {
      setMessage(this.view, state);
      setPaneActionsEnabled(state);
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
    this.focusSubscription = paneEditors.onDidChangeFocusedEditorPaneId(() => this.revealFocusedPane());
    this.visibilitySubscription = this.view.onDidChangeVisibility(() => this.revealFocusedPane());
    const state = model.getState();
    setMessage(this.view, state);
    setPaneActionsEnabled(state);
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

  // reveal resolves rows by id, so a freshly built item stands for the row VS Code already shows.
  getParent(item: PanesTreeItem): PanesTreeItem | undefined {
    if (!(item instanceof PaneTreeItem) || item instanceof SingletonPaneTreeItem) return undefined;
    const state = this.model.getState();
    if (state.kind === "unavailable" || state.kind === "no-space") return undefined;
    const group = state.items.find((candidate) => candidate.kind === "group" && candidate.tab.id === item.tabId);
    return group === undefined ? undefined : treeItem(group, this.expanded);
  }

  promptPaneName(currentLabel: string): Thenable<string | undefined> {
    return vscode.window.showInputBox({ title: "Rename Pane", value: currentLabel });
  }

  promptTabName(currentLabel: string): Thenable<string | undefined> {
    return vscode.window.showInputBox({
      title: "Rename Tab",
      value: currentLabel,
      validateInput: (value) => (value.trim().length === 0 ? "Tab name cannot be empty." : undefined),
    });
  }

  showPaneRenameError(error: unknown): void {
    void vscode.window.showErrorMessage(`Could not rename Pane: ${errorMessage(error)}`);
  }

  showTabRenameError(error: unknown): void {
    void vscode.window.showErrorMessage(`Could not rename Tab: ${errorMessage(error)}`);
  }

  showTabMoveError(error: unknown): void {
    void vscode.window.showErrorMessage(`Could not move Tab: ${errorMessage(error)}`);
  }

  showPaneCloseError(error: unknown): void {
    void vscode.window.showErrorMessage(`Could not close Pane: ${errorMessage(error)}`);
  }

  showTabCloseError(error: unknown): void {
    void vscode.window.showErrorMessage(`Could not close Tab: ${errorMessage(error)}`);
  }

  showPaneCreationError(error: unknown): void {
    void vscode.window.showErrorMessage(`Could not create Pane: ${errorMessage(error)}`);
  }

  showPaneSplitError(error: unknown): void {
    void vscode.window.showErrorMessage(`Could not split Pane: ${errorMessage(error)}`);
  }

  showCreatedPaneOpenError(error: unknown): void {
    void vscode.window.showErrorMessage(`Pane was created but could not be opened: ${errorMessage(error)}`);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription.dispose();
    this.expansionSubscription.dispose();
    this.collapseSubscription.dispose();
    this.focusSubscription.dispose();
    this.visibilitySubscription.dispose();
    this.view.dispose();
    this.changes.dispose();
    this.expanded.clear();
  }

  // Like the Explorer: reveal opens its view, so a hidden view waits until it is shown and catches up then.
  private revealFocusedPane(): void {
    const paneId = this.paneEditors.getFocusedEditorPaneId();
    if (!this.view.visible || paneId === undefined) return;
    const item = paneTreeItem(this.model.getState(), paneId);
    if (item !== undefined) void this.view.reveal(item, { select: true, focus: false });
  }
}

export class PanesGroupTreeItem extends vscode.TreeItem {
  constructor(readonly group: PaneNavigationGroup) {
    super(group.tab.label, vscode.TreeItemCollapsibleState.Expanded);
    this.id = group.tab.id;
    this.description = `${group.panes.length} ${group.panes.length === 1 ? "Pane" : "Panes"}`;
    this.contextValue = `herdr.panes.group${group.closable ? ".closable" : ""}`;
    this.iconPath = new vscode.ThemeIcon("folder");
    this.tooltip = [`Herdr Tab: ${group.tab.label}`, `ID: ${group.tab.id}`, `Panes: ${group.panes.length}`].join("\n");
    this.accessibilityInformation = { label: `${group.tab.label}, ${this.description}` };
  }
}

export class PaneTreeItem extends vscode.TreeItem {
  readonly paneId: string;
  readonly tabId: string;

  constructor(row: PaneNavigationRow | PaneNavigationSingleton) {
    const singleton = "kind" in row;
    const title = singleton ? row.title : row.name;
    super(title, vscode.TreeItemCollapsibleState.None);
    this.paneId = row.pane.id;
    this.tabId = row.tab.id;
    this.id = `herdr.pane.${this.paneId}`;
    if (singleton && row.description !== undefined) this.description = row.description;
    const kind = singleton ? "singleton" : "pane";
    this.contextValue = `herdr.panes.${kind}${row.closable ? ".closable" : ""}`;
    this.command = { command: "herdr.openPane", title: "Open Pane", arguments: [row.pane.id] };
    this.iconPath = new vscode.ThemeIcon("terminal");
    this.tooltip = [
      `Pane: ${row.name}`,
      `Pane ID: ${row.pane.id}`,
      `Terminal ID: ${row.pane.terminalId}`,
      `Herdr Tab: ${row.tab.label}`,
      `Tab ID: ${row.tab.id}`,
    ].join("\n");
    this.resourceUri = paneRowUri(row.pane.id);
    this.accessibilityInformation = {
      label: singleton && row.description !== undefined ? `${title}, ${row.description}` : title,
    };
  }
}

// A single-Pane Tab is shown as its Pane row, so the row also stands for the whole Tab.
class SingletonPaneTreeItem extends PaneTreeItem {}

// Only Tab rows are draggable; a drop on a Pane inside a group lands on that group's Tab.
class TabDragAndDropController implements vscode.TreeDragAndDropController<PanesTreeItem> {
  readonly dragMimeTypes = [tabMimeType];
  readonly dropMimeTypes = [tabMimeType, panesTreeMimeType];

  constructor(private readonly moveTab: TabMove) {}

  handleDrag(source: readonly PanesTreeItem[], dataTransfer: vscode.DataTransfer): void {
    const [item] = source;
    if (item instanceof PanesGroupTreeItem)
      dataTransfer.set(tabMimeType, new vscode.DataTransferItem(item.group.tab.id));
    else if (item instanceof SingletonPaneTreeItem)
      dataTransfer.set(tabMimeType, new vscode.DataTransferItem(item.tabId));
  }

  async handleDrop(target: PanesTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    const tabId = await dataTransfer.get(tabMimeType)?.asString();
    if (tabId === undefined) return;
    const targetTabId = target instanceof PanesGroupTreeItem ? target.group.tab.id : target?.tabId;
    await this.moveTab(tabId, targetTabId);
  }
}

function treeItem(item: PaneNavigationItem, expanded: ReadonlyMap<string, boolean>): PanesTreeItem {
  if (item.kind === "singleton") return new SingletonPaneTreeItem(item);
  const group = new PanesGroupTreeItem(item);
  if (expanded.get(item.tab.id) === false) group.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
  return group;
}

function paneTreeItem(state: PanesState, paneId: string): PaneTreeItem | undefined {
  if (state.kind === "unavailable" || state.kind === "no-space") return undefined;
  const singleton = state.items.find((item) => item.kind === "singleton" && item.pane.id === paneId);
  if (singleton?.kind === "singleton") return new SingletonPaneTreeItem(singleton);
  const row = state.items
    .flatMap((item) => (item.kind === "group" ? item.panes : []))
    .find((candidate) => candidate.pane.id === paneId);
  return row === undefined ? undefined : new PaneTreeItem(row);
}

function setPaneActionsEnabled(state: PanesState): void {
  void vscode.commands.executeCommand("setContext", "herdr.paneActionsEnabled", state.kind === "connected");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setMessage(view: vscode.TreeView<PanesTreeItem>, state: PanesState): void {
  let message: string | undefined;
  if (state.kind === "unavailable") {
    message = "Herdr Session is not connected";
  } else if (state.kind === "no-space") {
    message = "Select a Space to browse Panes";
  } else if (state.items.length === 0) {
    message = "No Panes in this Space";
  }
  // Assign rather than delete: TreeView.message is an accessor, and VS Code clears it with "".
  view.message = message ?? "";
}
