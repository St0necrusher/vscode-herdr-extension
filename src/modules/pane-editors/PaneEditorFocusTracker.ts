import * as vscode from "vscode";
import type { SelectedPaneEditor, PaneEditorSelection } from "./PaneEditorSelectionModel";

type FocusedPaneEditorEvent = Readonly<{
  focused: true;
  reason: "window-focused";
}>;

type HiddenPaneEditorEvent = Readonly<{
  focused: false;
  reason: "editor-hidden";
}>;

type BlurredPaneEditorEvent = Readonly<{
  focused: false;
  reason: "window-blurred";
}>;

export type FocusChangeEvent = FocusedPaneEditorEvent | HiddenPaneEditorEvent | BlurredPaneEditorEvent;

export type PaneEditorFocusListener = (event: FocusChangeEvent) => void;

export interface WindowFocusSource {
  readonly state: { readonly focused: boolean };
  onDidChangeWindowState(listener: (state: { readonly focused: boolean }) => void): { dispose(): void };
}

export class PaneEditorFocusTracker {
  private readonly selectedPaneIdsBySession = new Map<string, Set<string>>();
  private readonly listenersBySession = new Map<string, Map<string, Set<PaneEditorFocusListener>>>();
  private readonly selectionSubscriptions: readonly { dispose(): void }[];
  private readonly windowStateSubscription: { dispose(): void };
  private windowFocused: boolean;
  private disposed = false;

  constructor(selection: PaneEditorSelection, window: WindowFocusSource = vscode.window) {
    this.windowFocused = window.state.focused;
    this.selectionSubscriptions = [
      selection.subscribe("selected", (event) => this.handleSelected(event.selection)),
      selection.subscribe("deselected", (event) => this.handleDeselected(event.selection)),
      selection.subscribe("moved", (event) => this.handleMoved(event.previous, event.current)),
    ];
    this.windowStateSubscription = window.onDidChangeWindowState((state) => {
      this.handleWindowFocusChanged(state.focused);
    });
  }

  subscribe(selection: SelectedPaneEditor, listener: PaneEditorFocusListener): { dispose(): void } {
    if (this.disposed) return { dispose: () => undefined };

    this.addListener(selection, listener);
    try {
      listener(this.currentCondition(selection));
    } catch (error) {
      this.removeListener(selection, listener);
      throw error;
    }

    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.removeListener(selection, listener);
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.windowStateSubscription.dispose();
    this.selectionSubscriptions.forEach((subscription) => subscription.dispose());
    this.listenersBySession.clear();
    this.selectedPaneIdsBySession.clear();
  }

  private handleSelected(selection: SelectedPaneEditor): void {
    this.addSelected(selection);
    this.publish(selection, this.currentCondition(selection));
  }

  private handleDeselected(selection: SelectedPaneEditor): void {
    this.removeSelected(selection);
    this.publish(selection, { focused: false, reason: "editor-hidden" });
  }

  private handleMoved(previous: SelectedPaneEditor, current: SelectedPaneEditor): void {
    this.removeSelected(previous);
    this.addSelected(current);
  }

  private handleWindowFocusChanged(focused: boolean): void {
    if (this.disposed || this.windowFocused === focused) return;
    this.windowFocused = focused;
    this.selectedPaneIdsBySession.forEach((paneIds, sessionId) => {
      paneIds.forEach((paneId) => {
        this.publish(
          { sessionId, paneId },
          focused ? { focused: true, reason: "window-focused" } : { focused: false, reason: "window-blurred" },
        );
      });
    });
  }

  private currentCondition(selection: SelectedPaneEditor): FocusChangeEvent {
    if (this.selectedPaneIdsBySession.get(selection.sessionId)?.has(selection.paneId) === true) {
      return this.windowFocused
        ? { focused: true, reason: "window-focused" }
        : { focused: false, reason: "window-blurred" };
    }
    return { focused: false, reason: "editor-hidden" };
  }

  private addSelected(selection: SelectedPaneEditor): void {
    let paneIds = this.selectedPaneIdsBySession.get(selection.sessionId);
    if (paneIds === undefined) {
      paneIds = new Set();
      this.selectedPaneIdsBySession.set(selection.sessionId, paneIds);
    }
    paneIds.add(selection.paneId);
  }

  private removeSelected(selection: SelectedPaneEditor): void {
    const paneIds = this.selectedPaneIdsBySession.get(selection.sessionId);
    if (paneIds?.delete(selection.paneId) !== true) return;
    if (paneIds.size === 0) this.selectedPaneIdsBySession.delete(selection.sessionId);
  }

  private addListener(selection: SelectedPaneEditor, listener: PaneEditorFocusListener): void {
    let paneIds = this.listenersBySession.get(selection.sessionId);
    if (paneIds === undefined) {
      paneIds = new Map();
      this.listenersBySession.set(selection.sessionId, paneIds);
    }

    let listeners = paneIds.get(selection.paneId);
    if (listeners === undefined) {
      listeners = new Set();
      paneIds.set(selection.paneId, listeners);
    }
    listeners.add(listener);
  }

  private removeListener(selection: SelectedPaneEditor, listener: PaneEditorFocusListener): void {
    const paneIds = this.listenersBySession.get(selection.sessionId);
    const listeners = paneIds?.get(selection.paneId);
    listeners?.delete(listener);
    if (listeners?.size === 0) paneIds?.delete(selection.paneId);
    if (paneIds?.size === 0) this.listenersBySession.delete(selection.sessionId);
  }

  private publish(selection: SelectedPaneEditor, event: FocusChangeEvent): void {
    const listeners = this.listenersBySession.get(selection.sessionId)?.get(selection.paneId);
    if (listeners !== undefined) [...listeners].forEach((listener) => listener(event));
  }
}
