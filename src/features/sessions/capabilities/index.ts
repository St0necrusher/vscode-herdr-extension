import type { ReconnectPhase } from "@modules/sessions";

// Slice 2b removes this contract when configuration actions move to their scenario and view owners.
export interface HerdrConfigurationActions {
  selectExecutable(): Promise<void>;
  openSettings(): Promise<void>;
}

export type HerdrStatusAction = "start" | "select-executable" | "open-settings" | "retry" | "show-diagnostics";

type HerdrStatusIdentity = Readonly<{
  herdrSession: string;
  executable: string;
  availableActions: readonly HerdrStatusAction[];
}>;

export type CheckingHerdrStatusModel = Readonly<{ kind: "checking" }>;
export type MissingExecutableHerdrStatusModel = Readonly<{ kind: "missing-executable" }>;
export type StoppedHerdrStatusModel = Readonly<{ kind: "stopped" }>;
export type ResolvingHerdrStatusModel = Readonly<{ kind: "resolving" }>;
export type ConnectingHerdrStatusModel = Readonly<{ kind: "connecting" }>;
export type ConnectedHerdrStatusModel = Readonly<{
  kind: "connected";
  version: string;
  protocol: number;
  endpoint: string;
}>;
export type ReconnectingHerdrStatusModel = Readonly<{
  kind: "reconnecting";
  diagnostic: string;
  phase: ReconnectPhase["kind"];
  retryAt?: number;
  version?: string;
  protocol?: number;
  endpoint?: string;
}>;
export type IncompatibleHerdrStatusModel = Readonly<{
  kind: "incompatible";
  diagnostic: string;
  version?: string;
  protocol?: number;
  endpoint?: string;
}>;
export type ErrorHerdrStatusModel = Readonly<{ kind: "error"; diagnostic: string }>;

export type HerdrStatusModel = HerdrStatusIdentity &
  (
    | CheckingHerdrStatusModel
    | MissingExecutableHerdrStatusModel
    | StoppedHerdrStatusModel
    | ResolvingHerdrStatusModel
    | ConnectingHerdrStatusModel
    | ConnectedHerdrStatusModel
    | ReconnectingHerdrStatusModel
    | IncompatibleHerdrStatusModel
    | ErrorHerdrStatusModel
  );
