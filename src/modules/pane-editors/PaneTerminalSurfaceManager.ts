import * as vscode from "vscode";
import { focusEditorGroup, waitForEditorGroups } from "@core/editor-groups";
import type { PaneEditorPresence, PaneEditorPresenceSource, PaneEditorReference } from "./paneEditorPresence";
import type { PaneTerminalClosing } from "./paneTerminalClosing";
import type { PaneTerminalPlacement } from "./paneTerminalPlacement";
import type { PaneTerminalOpenRequest, PaneTerminalOpening } from "./paneTerminalOpening";
import type { HerdrSessionEventSource } from "./session-source";
import type { HerdrPaneMovedEvent } from "@api/herdr";
import type { PaneEditorSelection, SelectedPaneEditor } from "./PaneEditorSelectionModel";
import type { PaneTerminalSurface, PaneTerminalSurfaceFactory } from "./PaneTerminalSurface";

interface ManagedPaneSurface {
  selection: SelectedPaneEditor;
  readonly terminalName: string;
  readonly surface: PaneTerminalSurface;
  tab: vscode.Tab | undefined;
}

export class PaneTerminalSurfaceManager
  implements PaneTerminalOpening, PaneTerminalClosing, PaneTerminalPlacement, PaneEditorPresenceSource
{
  private readonly surfacesBySession = new Map<string, Map<string, ManagedPaneSurface>>();
  private readonly presenceListeners = new Set<(presence: PaneEditorPresence) => void>();
  private presence: PaneEditorPresence = { visible: [] };
  private readonly subscriptions: readonly { dispose(): void }[];
  private disposed = false;

  constructor(
    private readonly selection: PaneEditorSelection,
    sessionEvents: HerdrSessionEventSource,
    private readonly surfaceFactory: PaneTerminalSurfaceFactory,
  ) {
    const tabGroups = vscode.window.tabGroups;
    this.subscriptions = [
      sessionEvents.subscribe("pane.moved", (event) => this.handlePaneMoved(event)),
      tabGroups.onDidChangeTabs(() => this.handleTabsChanged()),
      // Switching the active group fires no tab change, yet it moves the focused Pane Editor.
      tabGroups.onDidChangeTabGroups(() => this.handleTabsChanged()),
      vscode.window.onDidChangeActiveTerminal(() => this.updateActiveTerminalContext()),
    ];
    this.updateActiveTerminalContext();
  }

  openPane(request: PaneTerminalOpenRequest): void {
    this.openPaneSurface(request);
  }

  private openPaneSurface(
    request: PaneTerminalOpenRequest,
    viewColumn = vscode.window.tabGroups.activeTabGroup.viewColumn,
  ): ManagedPaneSurface {
    const selection = { sessionId: request.sessionId, paneId: request.paneId };
    const existing = this.getSurface(selection);
    if (existing !== undefined) {
      // A Visible Pane Editor in an inactive group is revealed so that it takes focus.
      if (!this.isSurfaceFocused(existing)) {
        existing.surface.reveal();
        this.reconcileTabBindings();
      }
      return existing;
    }

    const terminalName = this.terminalName(selection);
    const surface = this.surfaceFactory.create(selection, viewColumn, terminalName);
    const managed: ManagedPaneSurface = { selection, terminalName, surface, tab: undefined };
    this.setSurface(selection, managed);
    surface.onDidClose(() => this.handleSurfaceClosed(managed));
    surface.reveal();
    this.reconcileTabBindings();
    return managed;
  }

  async closeDisplacedPanes(requests: readonly PaneTerminalOpenRequest[]): Promise<void> {
    const displacedPanes = () =>
      this.allSurfaces().filter((managed) => {
        const targetIndex = requests.findIndex((request) => {
          const isRequestedPane =
            request.sessionId === managed.selection.sessionId && request.paneId === managed.selection.paneId;
          return isRequestedPane;
        });
        const targetColumn: vscode.ViewColumn = targetIndex + 1;
        const lastColumn: vscode.ViewColumn = requests.length;
        const isMisplaced = targetIndex !== -1 && managed.tab?.group.viewColumn !== targetColumn;
        const isInSurplusGroup = managed.tab !== undefined && managed.tab.group.viewColumn > lastColumn;
        return isMisplaced || isInSurplusGroup;
      });
    let displaced = displacedPanes();
    // Closing a lone Pane Editor removes its group and shifts later groups; re-read displacement after each batch.
    while (displaced.length > 0) {
      const tabs: vscode.Tab[] = [];
      for (const managed of displaced) {
        tabs.push(await this.waitForPaneTab(managed));
      }
      const closed = await vscode.window.tabGroups.close(tabs);
      if (!closed) throw new Error("Could not close displaced Pane Editors");
      for (const managed of displaced) {
        await waitForEditorGroups(() => (this.getSurface(managed.selection) !== managed ? true : undefined));
      }
      displaced = displacedPanes();
    }
  }

  async placePanes(requests: readonly PaneTerminalOpenRequest[]): Promise<void> {
    const cells = requests.map((request, index) => {
      const viewColumn: vscode.ViewColumn = index + 1;
      return { request, viewColumn };
    });
    for (const cell of cells) {
      const managed = this.getSurface(cell.request) ?? this.openPaneSurface(cell.request, cell.viewColumn);
      await this.waitForPaneTab(managed, cell.viewColumn);
      // This path selects the cell's Pane without activating that editor group.
      managed.surface.terminal.show(true);
      await waitForEditorGroups(() => {
        const isActiveInCell = managed.tab?.isActive === true && managed.tab.group.viewColumn === cell.viewColumn;
        return isActiveInCell ? true : undefined;
      });
    }
  }

  async focusPane(sessionId: string, paneId: string): Promise<void> {
    const request = { sessionId, paneId };
    const managed = this.requireSurface(request);
    const tab = await this.waitForPaneTab(managed);
    await focusEditorGroup(tab.group.viewColumn);
    managed.surface.reveal();
    await waitForEditorGroups(() => (this.isSurfaceFocused(managed) ? true : undefined));
  }

  private requireSurface(selection: SelectedPaneEditor): ManagedPaneSurface {
    const managed = this.getSurface(selection);
    if (managed === undefined) throw new Error("Pane Editor is no longer open");
    return managed;
  }

  private async waitForPaneTab(managed: ManagedPaneSurface, viewColumn?: vscode.ViewColumn): Promise<vscode.Tab> {
    return await waitForEditorGroups(() => {
      const tab = managed.tab;
      const matchesColumn = tab !== undefined && (viewColumn === undefined || tab.group.viewColumn === viewColumn);
      return matchesColumn ? tab : undefined;
    });
  }

  getPaneEditorPresence(): PaneEditorPresence {
    return this.presence;
  }

  onDidChangePaneEditorPresence(listener: (presence: PaneEditorPresence) => void): { dispose(): void } {
    this.presenceListeners.add(listener);
    return { dispose: () => this.presenceListeners.delete(listener) };
  }

  closePanes(sessionId: string, paneIds: readonly string[]): void {
    paneIds.forEach((paneId) => {
      const managed = this.getSurface({ sessionId, paneId });
      if (managed !== undefined) this.handleSurfaceClosed(managed);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.surfacesBySession.forEach((surfaces) => {
      surfaces.forEach((managed) => managed.surface.dispose());
    });
    this.surfacesBySession.clear();
    this.presenceListeners.clear();
    // The context key outlives the extension host; without this, arrows in plain terminals would send markers.
    void vscode.commands.executeCommand("setContext", "herdr.activeTerminalIsPane", false);
  }

  private handlePaneMoved(event: HerdrPaneMovedEvent): void {
    const previous = { sessionId: event.sessionId, paneId: event.previousPaneId };
    const current = { sessionId: event.sessionId, paneId: event.currentPane.id };

    const managed = this.getSurface(previous);
    if (managed === undefined) return;

    this.removeSurface(previous);
    managed.selection = current;
    this.setSurface(current, managed);
    this.selection.move(previous, current);
    managed.surface.move(event.currentPane);
    this.updatePresence();
  }

  private handleSurfaceClosed(managed: ManagedPaneSurface): void {
    this.removeSurface(managed.selection);
    this.selection.deselect(managed.selection);
    managed.surface.dispose();
    this.updatePresence();
  }

  private handleTabsChanged(): void {
    if (this.disposed) return;

    this.reconcileTabBindings();
    this.updateActiveTerminalContext();
  }

  // Tracks herdr.activeTerminalIsPane for the contributed keybindings.
  private updateActiveTerminalContext(): void {
    const activeTerminal = vscode.window.activeTerminal;
    const isPaneTerminalActive = this.allSurfaces().some((managed) => managed.surface.terminal === activeTerminal);
    void vscode.commands.executeCommand("setContext", "herdr.activeTerminalIsPane", isPaneTerminalActive);
  }

  private reconcileTabBindings(): void {
    const groups = vscode.window.tabGroups.all;
    const tabs = groups.flatMap((group) => group.tabs);

    this.allSurfaces().forEach((managed) => {
      if (managed.tab === undefined || !tabs.includes(managed.tab)) {
        const wasBound = managed.tab !== undefined;
        managed.tab = tabs.find(
          (tab) => tab.input instanceof vscode.TabInputTerminal && tab.label === managed.terminalName,
        );
        if (!wasBound && managed.tab !== undefined) managed.surface.showPaneName();
        if (wasBound && managed.tab === undefined) {
          this.selection.deselect(managed.selection);
          managed.surface.hidePaneName();
        }
      }
    });

    this.allSurfaces().forEach((managed) => {
      if (managed.tab !== undefined) {
        if (groups.some((group) => group.activeTab === managed.tab)) {
          this.selection.select(managed.selection);
        } else {
          this.selection.deselect(managed.selection);
        }
      }
    });
    this.updatePresence();
  }

  private updatePresence(): void {
    const tabGroups = vscode.window.tabGroups;
    const bound = this.allSurfaces().filter((managed) => managed.tab !== undefined);
    const visible = bound
      .filter((managed) => tabGroups.all.some((group) => group.activeTab === managed.tab))
      .map((managed) => managed.selection);
    const focused = bound.find((managed) => this.isSurfaceFocused(managed))?.selection;
    const next: PaneEditorPresence = focused === undefined ? { visible } : { visible, focused };
    if (samePresence(this.presence, next)) return;
    this.presence = next;
    for (const listener of [...this.presenceListeners]) listener(next);
  }

  private isSurfaceFocused(managed: ManagedPaneSurface): boolean {
    return managed.tab !== undefined && vscode.window.tabGroups.activeTabGroup.activeTab === managed.tab;
  }

  private allSurfaces(): ManagedPaneSurface[] {
    return [...this.surfacesBySession.values()].flatMap((surfaces) => [...surfaces.values()]);
  }

  private getSurface(selection: SelectedPaneEditor): ManagedPaneSurface | undefined {
    return this.surfacesBySession.get(selection.sessionId)?.get(selection.paneId);
  }

  private setSurface(selection: SelectedPaneEditor, surface: ManagedPaneSurface): void {
    let surfaces = this.surfacesBySession.get(selection.sessionId);
    if (surfaces === undefined) {
      surfaces = new Map();
      this.surfacesBySession.set(selection.sessionId, surfaces);
    }
    surfaces.set(selection.paneId, surface);
  }

  private removeSurface(selection: SelectedPaneEditor): void {
    const surfaces = this.surfacesBySession.get(selection.sessionId);
    surfaces?.delete(selection.paneId);
    if (surfaces?.size === 0) this.surfacesBySession.delete(selection.sessionId);
  }

  private terminalName(selection: SelectedPaneEditor): string {
    return `${selection.sessionId}:${selection.paneId}`;
  }
}

function samePresence(left: PaneEditorPresence, right: PaneEditorPresence): boolean {
  return (
    sameReference(left.focused, right.focused) &&
    left.visible.length === right.visible.length &&
    left.visible.every((reference, index) => sameReference(reference, right.visible[index]))
  );
}

function sameReference(left: PaneEditorReference | undefined, right: PaneEditorReference | undefined): boolean {
  return left?.sessionId === right?.sessionId && left?.paneId === right?.paneId;
}
