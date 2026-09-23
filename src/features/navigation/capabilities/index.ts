import type { HerdrSessionSnapshot } from "@capabilities/sessions";

export type UnavailableNavigationContextState = Readonly<{
  kind: "unavailable";
  sessionId?: string;
}>;

export type ConnectedNavigationContextState = Readonly<{
  kind: "connected";
  sessionId: string;
  snapshot: HerdrSessionSnapshot;
  selectedSpaceId?: string;
}>;

export type StaleNavigationContextState = Readonly<{
  kind: "stale";
  sessionId: string;
  reason: "reconnecting" | "incompatible";
  snapshot: HerdrSessionSnapshot;
  selectedSpaceId?: string;
}>;

export type NavigationContextState =
  UnavailableNavigationContextState | ConnectedNavigationContextState | StaleNavigationContextState;

export interface NavigationContextSource {
  getState(): NavigationContextState;
  onDidChange(listener: (state: NavigationContextState) => void): { dispose(): void };
}

export interface SpaceSelectionOperations {
  selectSpace(spaceId: string): void;
}
