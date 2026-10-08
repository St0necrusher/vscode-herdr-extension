import type { HerdrSessionSnapshot } from "@api/herdr";
import type { SessionsState } from "./sessionsState";

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

export function activeSessionProjection(state: SessionsState): ActiveSessionProjectionState {
  const active = state.active;
  if (active.kind === "connected") {
    return { kind: "connected", sessionId: active.session.id, snapshot: active.snapshot };
  }
  const hasReconnectingProjection = active.kind === "reconnecting" && active.staleProjection !== undefined;
  if (hasReconnectingProjection) {
    return {
      kind: "stale",
      sessionId: active.session.id,
      reason: "reconnecting",
      snapshot: active.staleProjection.snapshot,
    };
  }
  const hasIncompatibleProjection = active.kind === "incompatible" && active.staleProjection !== undefined;
  if (hasIncompatibleProjection) {
    return {
      kind: "stale",
      sessionId: active.session.id,
      reason: "incompatible",
      snapshot: active.staleProjection.snapshot,
    };
  }
  const sessionId = active.kind === "unselected" ? undefined : active.session.id;
  return sessionId === undefined ? { kind: "unavailable" } : { kind: "unavailable", sessionId };
}
