import type { HerdrSessionSnapshot } from "@api/herdr";

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

export type PaneEditorReference = Readonly<{ sessionId: string; paneId: string }>;

export type PaneEditorPresence = Readonly<{
  visible: readonly PaneEditorReference[];
  focused?: PaneEditorReference;
}>;

export interface PaneEditorPresenceSource {
  getPaneEditorPresence(): PaneEditorPresence;
  onDidChangePaneEditorPresence(listener: (presence: PaneEditorPresence) => void): { dispose(): void };
}
