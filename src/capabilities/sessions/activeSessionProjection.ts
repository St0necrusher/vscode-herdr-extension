import type { HerdrSessionSnapshot } from "./snapshot";

export type UnavailableActiveSessionProjectionState = Readonly<{
  kind: "unavailable";
  sessionId?: string;
}>;

export type ConnectedActiveSessionProjectionState = Readonly<{
  kind: "connected";
  sessionId: string;
  snapshot: HerdrSessionSnapshot;
}>;

export type StaleActiveSessionProjectionState = Readonly<{
  kind: "stale";
  sessionId: string;
  reason: "reconnecting" | "incompatible";
  snapshot: HerdrSessionSnapshot;
}>;

export type ActiveSessionProjectionState =
  UnavailableActiveSessionProjectionState | ConnectedActiveSessionProjectionState | StaleActiveSessionProjectionState;

export interface ActiveSessionProjectionSource {
  getActiveSessionProjection(): ActiveSessionProjectionState;
  onDidChangeActiveSessionProjection(listener: (state: ActiveSessionProjectionState) => void): { dispose(): void };
}
