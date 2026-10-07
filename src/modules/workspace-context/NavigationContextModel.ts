import type { HerdrPane } from "@api/herdr";
import type {
  ActiveSessionProjectionSource,
  ActiveSessionProjectionState,
  PaneEditorPresence,
  PaneEditorPresenceSource,
} from "./source";
import type {
  NavigationContextState,
  NavigationContextSource,
  SpaceSelectionOperations,
  VisiblePaneEditorsSource,
} from "./state";

export class NavigationContextModel
  implements NavigationContextSource, SpaceSelectionOperations, VisiblePaneEditorsSource
{
  private readonly listeners = new Set<(state: NavigationContextState) => void>();
  private readonly visibleListeners = new Set<(paneIds: ReadonlySet<string>) => void>();
  private readonly focusedListeners = new Set<(paneId: string | undefined) => void>();
  private readonly sessionSubscription: { dispose(): void };
  private readonly presenceSubscription: { dispose(): void };
  private presence: PaneEditorPresence;
  private state: NavigationContextState;
  private visiblePaneIds: ReadonlySet<string>;
  private focusedEditorPaneId: string | undefined;
  private disposed = false;

  constructor(source: ActiveSessionProjectionSource, presenceSource: PaneEditorPresenceSource) {
    this.presence = presenceSource.getPaneEditorPresence();
    this.state = contextState(source.getActiveSessionProjection());
    this.visiblePaneIds = activeSessionVisiblePaneIds(this.state, this.presence);
    this.focusedEditorPaneId = focusedEditorPane(this.state, this.presence)?.id;
    this.sessionSubscription = source.onDidChangeActiveSessionProjection((next) => this.replaceProjection(next));
    this.presenceSubscription = presenceSource.onDidChangePaneEditorPresence((next) => this.replacePresence(next));
  }

  getState(): NavigationContextState {
    return this.state;
  }

  onDidChange(listener: (state: NavigationContextState) => void): { dispose(): void } {
    if (this.disposed) return { dispose: () => undefined };
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  getVisiblePaneIds(): ReadonlySet<string> {
    return this.visiblePaneIds;
  }

  onDidChangeVisiblePaneIds(listener: (paneIds: ReadonlySet<string>) => void): { dispose(): void } {
    if (this.disposed) return { dispose: () => undefined };
    this.visibleListeners.add(listener);
    return { dispose: () => this.visibleListeners.delete(listener) };
  }

  getFocusedEditorPaneId(): string | undefined {
    return this.focusedEditorPaneId;
  }

  onDidChangeFocusedEditorPaneId(listener: (paneId: string | undefined) => void): { dispose(): void } {
    if (this.disposed) return { dispose: () => undefined };
    this.focusedListeners.add(listener);
    return { dispose: () => this.focusedListeners.delete(listener) };
  }

  selectSpace(spaceId: string): void {
    if (this.disposed) return;
    const current = this.state;
    if (current.kind === "unavailable" || !current.snapshot.spaces.some((space) => space.id === spaceId)) return;
    if (current.selectedSpaceId === spaceId) return;
    this.update({ ...current, selectedSpaceId: spaceId });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sessionSubscription.dispose();
    this.presenceSubscription.dispose();
    this.listeners.clear();
    this.visibleListeners.clear();
    this.focusedListeners.clear();
  }

  private replaceProjection(next: ActiveSessionProjectionState): void {
    if (this.disposed) return;
    this.update(contextState(next, this.state));
  }

  private replacePresence(next: PaneEditorPresence): void {
    if (this.disposed) return;
    this.presence = next;
    this.update(this.state);
  }

  // All facts are applied before any is published, so every listener reads a consistent set. The Focused Pane Editor
  // is published last, so a tree that reveals its row has already queued the refresh for a new Selected Space.
  private update(next: NavigationContextState): void {
    const focusedPane = focusedEditorPane(next, this.presence);
    const nextFocusedEditorPaneId = focusedPane?.id;
    const focusedChanged = nextFocusedEditorPaneId !== this.focusedEditorPaneId;
    // Only a change of the Focused Pane Editor moves the Selected Space, so a Space the user picks is not overridden.
    const movesSelectedSpace = focusedChanged && focusedPane !== undefined && next.kind !== "unavailable";
    const nextState = movesSelectedSpace ? { ...next, selectedSpaceId: focusedPane.spaceId } : next;
    const stateChanged = !sameState(this.state, nextState);
    const nextVisiblePaneIds = activeSessionVisiblePaneIds(nextState, this.presence);
    const visibleChanged = !sameIds(this.visiblePaneIds, nextVisiblePaneIds);
    if (stateChanged) this.state = nextState;
    if (visibleChanged) this.visiblePaneIds = nextVisiblePaneIds;
    if (focusedChanged) this.focusedEditorPaneId = nextFocusedEditorPaneId;
    if (stateChanged) [...this.listeners].forEach((listener) => listener(this.state));
    if (visibleChanged) [...this.visibleListeners].forEach((listener) => listener(this.visiblePaneIds));
    if (focusedChanged) [...this.focusedListeners].forEach((listener) => listener(this.focusedEditorPaneId));
  }
}

function contextState(next: ActiveSessionProjectionState, previous?: NavigationContextState): NavigationContextState {
  if (next.kind === "unavailable") {
    return next.sessionId === undefined ? { kind: "unavailable" } : { kind: "unavailable", sessionId: next.sessionId };
  }

  const selectedSpaceId = resolveSelectedSpace(next, previous);
  if (next.kind === "connected") {
    return {
      kind: "connected",
      sessionId: next.sessionId,
      snapshot: next.snapshot,
      ...(selectedSpaceId === undefined ? {} : { selectedSpaceId }),
    };
  }
  return {
    kind: "stale",
    sessionId: next.sessionId,
    reason: next.reason,
    snapshot: next.snapshot,
    ...(selectedSpaceId === undefined ? {} : { selectedSpaceId }),
  };
}

function resolveSelectedSpace(
  next: Exclude<ActiveSessionProjectionState, { kind: "unavailable" }>,
  previous: NavigationContextState | undefined,
): string | undefined {
  const previousSelection =
    previous !== undefined && previous.kind !== "unavailable" && previous.sessionId === next.sessionId
      ? previous.selectedSpaceId
      : undefined;
  if (previousSelection !== undefined && next.snapshot.spaces.some((space) => space.id === previousSelection)) {
    return previousSelection;
  }
  if (
    next.snapshot.focusedSpaceId !== undefined &&
    next.snapshot.spaces.some((space) => space.id === next.snapshot.focusedSpaceId)
  ) {
    return next.snapshot.focusedSpaceId;
  }
  return next.snapshot.spaces[0]?.id;
}

function activeSessionVisiblePaneIds(state: NavigationContextState, presence: PaneEditorPresence): ReadonlySet<string> {
  return new Set(
    presence.visible.filter((editor) => editor.sessionId === state.sessionId).map((editor) => editor.paneId),
  );
}

// A Pane its snapshot does not list yet, such as one just moved, counts as unfocused until a snapshot lists it, so
// the Selected Space and revealed rows catch up then.
function focusedEditorPane(state: NavigationContextState, presence: PaneEditorPresence): HerdrPane | undefined {
  const focused = presence.focused;
  if (state.kind === "unavailable" || focused?.sessionId !== state.sessionId) return undefined;
  return state.snapshot.panes.find((pane) => pane.id === focused.paneId);
}

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function sameState(left: NavigationContextState, right: NavigationContextState): boolean {
  if (left.kind !== right.kind || left.sessionId !== right.sessionId) return false;
  if (left.kind === "unavailable" || right.kind === "unavailable") return true;
  return (
    left.snapshot === right.snapshot &&
    left.selectedSpaceId === right.selectedSpaceId &&
    (left.kind === "connected" || right.kind === "connected" || left.reason === right.reason)
  );
}
