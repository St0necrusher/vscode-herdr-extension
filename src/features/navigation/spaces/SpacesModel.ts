import type { HerdrSpace } from "@capabilities/sessions";
import type { NavigationContextSource } from "../capabilities";

export type SpaceNavigationEntry = Readonly<{
  space: HerdrSpace;
  selected: boolean;
}>;

export type UnavailableSpacesState = Readonly<{
  kind: "unavailable";
  sessionId?: string;
}>;

export type ConnectedSpacesState = Readonly<{
  kind: "connected";
  sessionId: string;
  spaces: readonly SpaceNavigationEntry[];
}>;

export type StaleSpacesState = Readonly<{
  kind: "stale";
  sessionId: string;
  reason: "reconnecting" | "incompatible";
  spaces: readonly SpaceNavigationEntry[];
}>;

export type SpacesState = UnavailableSpacesState | ConnectedSpacesState | StaleSpacesState;

export class SpacesModel {
  private readonly listeners = new Set<(state: SpacesState) => void>();
  private readonly contextSubscription: { dispose(): void };
  private disposed = false;

  constructor(private readonly context: NavigationContextSource) {
    this.contextSubscription = context.onDidChange((state) => {
      if (this.disposed) return;
      const next = this.getState(state);
      for (const listener of [...this.listeners]) listener(next);
    });
  }

  getState(context = this.context.getState()): SpacesState {
    if (context.kind === "unavailable") {
      return context.sessionId === undefined
        ? { kind: "unavailable" }
        : { kind: "unavailable", sessionId: context.sessionId };
    }
    const spaces = context.snapshot.spaces.map((space) => ({
      space,
      selected: space.id === context.selectedSpaceId,
    }));
    return context.kind === "connected"
      ? { kind: "connected", sessionId: context.sessionId, spaces }
      : { kind: "stale", sessionId: context.sessionId, reason: context.reason, spaces };
  }

  onDidChange(listener: (state: SpacesState) => void): { dispose(): void } {
    if (this.disposed) return { dispose: () => undefined };
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.contextSubscription.dispose();
    this.listeners.clear();
  }
}
