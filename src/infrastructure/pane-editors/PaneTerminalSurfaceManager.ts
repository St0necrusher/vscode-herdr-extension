import * as vscode from "vscode";
import type { PaneTerminalOpenRequest, PaneTerminalOpening } from "@capabilities/terminalSurfaces";
import type { HerdrPaneMovedEvent, HerdrSessionEventSource } from "@capabilities/sessions";
import type { PaneEditorSelection, SelectedPaneEditor } from "./PaneEditorSelectionModel";
import type { PaneTerminalSurface, PaneTerminalSurfaceFactory } from "./PaneTerminalSurface";

interface ManagedPaneSurface {
  selection: SelectedPaneEditor;
  readonly terminalName: string;
  readonly surface: PaneTerminalSurface;
  tab: vscode.Tab | undefined;
}

export class PaneTerminalSurfaceManager implements PaneTerminalOpening {
  private readonly surfacesBySession = new Map<string, Map<string, ManagedPaneSurface>>();
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
      vscode.window.onDidChangeActiveTerminal(() => this.updateActiveTerminalContext()),
    ];
    this.updateActiveTerminalContext();
  }

  openPane(request: PaneTerminalOpenRequest): void {
    const selection = { sessionId: request.sessionId, paneId: request.paneId };
    const existing = this.getSurface(selection);
    if (existing !== undefined) {
      const surfaceIsAlreadyActive = existing.tab !== undefined && this.isActiveTab(existing.tab);
      if (surfaceIsAlreadyActive) return;
      existing.surface.reveal();
      this.reconcileTabBindings();
      return;
    }

    const viewColumn = vscode.window.tabGroups.activeTabGroup.viewColumn;
    const terminalName = this.terminalName(selection);
    const surface = this.surfaceFactory.create(selection, viewColumn, terminalName);
    const managed: ManagedPaneSurface = { selection, terminalName, surface, tab: undefined };
    this.setSurface(selection, managed);
    surface.onDidClose(() => this.handleSurfaceClosed(managed));
    surface.reveal();
    this.reconcileTabBindings();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.surfacesBySession.forEach((surfaces) => {
      surfaces.forEach((managed) => managed.surface.dispose());
    });
    this.surfacesBySession.clear();
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
  }

  private handleSurfaceClosed(managed: ManagedPaneSurface): void {
    this.removeSurface(managed.selection);
    this.selection.deselect(managed.selection);
    managed.surface.dispose();
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
  }

  private isActiveTab(tab: vscode.Tab): boolean {
    return vscode.window.tabGroups.all.some((group) => group.activeTab === tab);
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
