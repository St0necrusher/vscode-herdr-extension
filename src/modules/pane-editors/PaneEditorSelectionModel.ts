export type SelectedPaneEditor = Readonly<{
  sessionId: string;
  paneId: string;
}>;

export type PaneEditorSelectionEventMap = Readonly<{
  selected: Readonly<{
    selection: SelectedPaneEditor;
  }>;
  deselected: Readonly<{
    selection: SelectedPaneEditor;
  }>;
  moved: Readonly<{
    previous: SelectedPaneEditor;
    current: SelectedPaneEditor;
  }>;
}>;

export type PaneEditorSelectionEventName = keyof PaneEditorSelectionEventMap;

export type InferPaneEditorSelectionEvent<TEventName extends PaneEditorSelectionEventName> =
  PaneEditorSelectionEventMap[TEventName];

export interface PaneEditorSelection {
  select(selection: SelectedPaneEditor): void;
  deselect(selection: SelectedPaneEditor): void;
  move(previous: SelectedPaneEditor, current: SelectedPaneEditor): void;
  subscribe<TEventName extends PaneEditorSelectionEventName>(
    eventName: TEventName,
    listener: (event: InferPaneEditorSelectionEvent<TEventName>) => void,
  ): { dispose(): void };
  dispose(): void;
}

type SelectionListener = (event: unknown) => void;

export class PaneEditorSelectionModel implements PaneEditorSelection {
  private readonly selectedPaneIdsBySession = new Map<string, Set<string>>();
  private readonly listeners: Record<PaneEditorSelectionEventName, Set<SelectionListener>> = {
    selected: new Set(),
    deselected: new Set(),
    moved: new Set(),
  };
  private disposed = false;

  select(selection: SelectedPaneEditor): void {
    if (this.disposed || this.has(selection)) return;
    this.add(selection);
    this.publish("selected", { selection });
  }

  deselect(selection: SelectedPaneEditor): void {
    if (this.disposed || !this.remove(selection)) return;
    this.publish("deselected", { selection });
  }

  move(previous: SelectedPaneEditor, current: SelectedPaneEditor): void {
    if (!this.remove(previous)) return;
    this.add(current);
    this.publish("moved", { previous, current });
  }

  subscribe<TEventName extends PaneEditorSelectionEventName>(
    eventName: TEventName,
    listener: (event: InferPaneEditorSelectionEvent<TEventName>) => void,
  ): { dispose(): void } {
    if (this.disposed) return { dispose: () => undefined };
    const listeners = this.listeners[eventName];
    const typedListener = listener as (event: unknown) => void;
    listeners.add(typedListener);
    let disposed = false;
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        listeners.delete(typedListener);
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    Object.values(this.listeners).forEach((listeners) => listeners.clear());
    this.selectedPaneIdsBySession.clear();
  }

  private has(selection: SelectedPaneEditor): boolean {
    return this.selectedPaneIdsBySession.get(selection.sessionId)?.has(selection.paneId) ?? false;
  }

  private add(selection: SelectedPaneEditor): void {
    let paneIds = this.selectedPaneIdsBySession.get(selection.sessionId);
    if (paneIds === undefined) {
      paneIds = new Set();
      this.selectedPaneIdsBySession.set(selection.sessionId, paneIds);
    }
    paneIds.add(selection.paneId);
  }

  private remove(selection: SelectedPaneEditor): boolean {
    const paneIds = this.selectedPaneIdsBySession.get(selection.sessionId);
    if (paneIds?.delete(selection.paneId) !== true) return false;
    if (paneIds.size === 0) this.selectedPaneIdsBySession.delete(selection.sessionId);
    return true;
  }

  private publish<TEventName extends PaneEditorSelectionEventName>(
    eventName: TEventName,
    event: InferPaneEditorSelectionEvent<TEventName>,
  ): void {
    [...this.listeners[eventName]].forEach((listener) => listener(event));
  }
}
