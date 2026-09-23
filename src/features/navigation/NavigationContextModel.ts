import type { ActiveSessionProjectionSource, ActiveSessionProjectionState } from "@capabilities/sessions";
import type { NavigationContextState, NavigationContextSource, SpaceSelectionOperations } from "./capabilities";

export class NavigationContextModel implements NavigationContextSource, SpaceSelectionOperations {
  private readonly listeners = new Set<(state: NavigationContextState) => void>();
  private readonly sessionSubscription: { dispose(): void };
  private state: NavigationContextState;
  private disposed = false;

  constructor(source: ActiveSessionProjectionSource) {
    this.state = contextState(source.getActiveSessionProjection());
    this.sessionSubscription = source.onDidChangeActiveSessionProjection((next) => this.replaceProjection(next));
  }

  getState(): NavigationContextState {
    return this.state;
  }

  onDidChange(listener: (state: NavigationContextState) => void): { dispose(): void } {
    if (this.disposed) return { dispose: () => undefined };
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  selectSpace(spaceId: string): void {
    if (this.disposed) return;
    const current = this.state;
    if (current.kind === "unavailable" || !current.snapshot.spaces.some((space) => space.id === spaceId)) return;
    if (current.selectedSpaceId === spaceId) return;
    this.publish({ ...current, selectedSpaceId: spaceId });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sessionSubscription.dispose();
    this.listeners.clear();
  }

  private replaceProjection(next: ActiveSessionProjectionState): void {
    if (this.disposed) return;
    const previous = this.state;
    const nextState = contextState(next, previous);
    if (sameState(previous, nextState)) return;
    this.publish(nextState);
  }

  private publish(next: NavigationContextState): void {
    this.state = next;
    for (const listener of [...this.listeners]) listener(next);
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

function sameState(left: NavigationContextState, right: NavigationContextState): boolean {
  if (left.kind !== right.kind || left.sessionId !== right.sessionId) return false;
  if (left.kind === "unavailable" || right.kind === "unavailable") return true;
  return (
    left.snapshot === right.snapshot &&
    left.selectedSpaceId === right.selectedSpaceId &&
    (left.kind === "connected" || right.kind === "connected" || left.reason === right.reason)
  );
}
