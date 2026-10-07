import type { HerdrConfiguration } from "./configuration";
import type {
  HerdrConnectionFailure,
  HerdrSessionDescriptor,
  HerdrSessionMetadata,
  HerdrSessionSnapshot,
} from "@api/herdr";

export type SessionsCatalogState =
  | Readonly<{ kind: "checking" }>
  | Readonly<{ kind: "missing-executable" }>
  | Readonly<{ kind: "ready"; sessions: readonly HerdrSessionDescriptor[] }>
  | Readonly<{ kind: "error"; sessions?: readonly HerdrSessionDescriptor[]; diagnostic: string }>;

export type UnselectedActiveSessionState = Readonly<{ kind: "unselected" }>;
export type SelectedStoppedActiveSessionState = Readonly<{
  kind: "selected-stopped";
  session: HerdrSessionDescriptor;
}>;
export type StartFailedActiveSessionState = Readonly<{
  kind: "start-failed";
  session: HerdrSessionDescriptor;
  diagnostic: string;
}>;
export type ResolvingActiveSessionState = Readonly<{ kind: "resolving"; session: HerdrSessionDescriptor }>;
export type ConnectingActiveSessionState = Readonly<{
  kind: "connecting";
  session: HerdrSessionDescriptor;
  endpoint: string;
}>;
export type ConnectedActiveSessionState = Readonly<{
  kind: "connected";
  session: HerdrSessionDescriptor;
  endpoint: string;
  metadata: HerdrSessionMetadata;
  snapshot: HerdrSessionSnapshot;
}>;
export type StaleSessionProjection = Readonly<{
  metadata: HerdrSessionMetadata;
  snapshot: HerdrSessionSnapshot;
}>;
export type AttemptingReconnectPhase = Readonly<{ kind: "attempting" }>;
export type WaitingReconnectPhase = Readonly<{ kind: "waiting"; retryAt: number }>;
export type ReconnectPhase = AttemptingReconnectPhase | WaitingReconnectPhase;
export type ReconnectingActiveSessionState = Readonly<{
  kind: "reconnecting";
  session: HerdrSessionDescriptor;
  endpoint?: string;
  staleProjection?: StaleSessionProjection;
  failure: Exclude<HerdrConnectionFailure, { kind: "incompatible" }>;
  phase: ReconnectPhase;
}>;
export type IncompatibleActiveSessionState = Readonly<{
  kind: "incompatible";
  session: HerdrSessionDescriptor;
  endpoint?: string;
  staleProjection?: StaleSessionProjection;
  failure: Extract<HerdrConnectionFailure, { kind: "incompatible" }>;
}>;

export type ActiveSessionState =
  | UnselectedActiveSessionState
  | SelectedStoppedActiveSessionState
  | StartFailedActiveSessionState
  | ResolvingActiveSessionState
  | ConnectingActiveSessionState
  | ConnectedActiveSessionState
  | ReconnectingActiveSessionState
  | IncompatibleActiveSessionState;

export type SessionsState = Readonly<{
  configuration: HerdrConfiguration;
  catalog: SessionsCatalogState;
  active: ActiveSessionState;
}>;

export interface SessionsStateSource {
  getState(): SessionsState;
  onDidChange(listener: (state: SessionsState) => void): { dispose(): void };
}

export interface SessionsOperations {
  refresh(): Promise<void>;
  selectSession(sessionId: string): Promise<void>;
  startSelectedSession(): Promise<void>;
  retry(): Promise<void>;
}

export interface PersistentKeyValueStorage {
  get(key: string): unknown;
  update(key: string, value: unknown): PromiseLike<void>;
}
