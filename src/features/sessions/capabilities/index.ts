import type {
  HerdrConfiguration,
  HerdrConnectionFailure,
  HerdrSessionDescriptor,
  HerdrSessionMetadata,
  HerdrSessionSnapshot,
} from "@capabilities/sessions";

export type SessionsCatalogState =
  | Readonly<{ kind: "checking" }>
  | Readonly<{ kind: "missing-executable" }>
  | Readonly<{ kind: "ready"; sessions: readonly HerdrSessionDescriptor[] }>
  | Readonly<{ kind: "error"; sessions?: readonly HerdrSessionDescriptor[]; diagnostic: string }>;

export type ActiveSessionState =
  | Readonly<{ kind: "unselected" }>
  | Readonly<{ kind: "selected-stopped"; session: HerdrSessionDescriptor }>
  | Readonly<{ kind: "start-failed"; session: HerdrSessionDescriptor; diagnostic: string }>
  | Readonly<{ kind: "resolving"; session: HerdrSessionDescriptor }>
  | Readonly<{ kind: "connecting"; session: HerdrSessionDescriptor; endpoint: string }>
  | Readonly<{
      kind: "connected";
      session: HerdrSessionDescriptor;
      endpoint: string;
      metadata: HerdrSessionMetadata;
      snapshot: HerdrSessionSnapshot;
    }>
  | Readonly<{
      kind: "incompatible";
      session: HerdrSessionDescriptor;
      endpoint?: string;
      failure: Extract<HerdrConnectionFailure, { kind: "incompatible" }>;
    }>
  | Readonly<{
      kind: "disconnected";
      session: HerdrSessionDescriptor;
      endpoint?: string;
      metadata?: HerdrSessionMetadata;
      failure: Exclude<HerdrConnectionFailure, { kind: "incompatible" }>;
    }>;

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

export type HerdrStatusAction = "start" | "select-executable" | "open-settings" | "retry" | "show-diagnostics";

type HerdrStatusIdentity = Readonly<{
  herdrSession: string;
  executable: string;
  availableActions: readonly HerdrStatusAction[];
}>;

export type HerdrStatusModel = HerdrStatusIdentity &
  (
    | Readonly<{ kind: "checking" }>
    | Readonly<{ kind: "missing-executable" }>
    | Readonly<{ kind: "stopped" }>
    | Readonly<{ kind: "resolving" }>
    | Readonly<{ kind: "connecting" }>
    | Readonly<{ kind: "connected"; version: string; protocol: number; endpoint: string }>
    | Readonly<{ kind: "incompatible"; diagnostic: string; version?: string; protocol?: number; endpoint?: string }>
    | Readonly<{ kind: "disconnected"; diagnostic: string; version?: string; protocol?: number; endpoint?: string }>
    | Readonly<{ kind: "error"; diagnostic: string }>
  );
