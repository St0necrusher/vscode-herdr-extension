import type { HerdrSessionCatalogState } from "#capabilities/sessions";

export interface HerdrSessionCatalogStateSource {
  getState(): HerdrSessionCatalogState;
  onDidChange(listener: (state: HerdrSessionCatalogState) => void): {
    dispose(): void;
  };
}

export interface HerdrSessionCatalogOperations {
  retry(): Promise<void>;
  start(): Promise<void>;
}

export interface HerdrStatusOperations {
  showActions(): Promise<void>;
}

export type HerdrStatusAction =
  | "start"
  | "select-executable"
  | "open-settings"
  | "retry"
  | "show-diagnostics";

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
    | Readonly<{
        kind: "connected";
        version: string;
        protocol: number;
        endpoint: string;
      }>
    | Readonly<{
        kind: "incompatible";
        version?: string;
        protocol?: number;
        endpoint?: string;
      }>
    | Readonly<{ kind: "error"; diagnostic: string }>
  );

export interface HerdrStatusView {
  render(status: HerdrStatusModel): void;
  chooseAction(
    status: HerdrStatusModel,
  ): Promise<HerdrStatusAction | undefined>;
}
