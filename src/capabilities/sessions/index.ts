export type HerdrConfiguration = Readonly<{
  executable: string;
  session: string;
}>;

export type HerdrSessionCatalogState =
  | Readonly<{ kind: "checking"; configuration: HerdrConfiguration }>
  | Readonly<{
      kind: "missing-executable";
      configuration: HerdrConfiguration;
    }>
  | Readonly<{
      kind: "stopped";
      configuration: HerdrConfiguration;
    }>
  | Readonly<{
      kind: "connected";
      configuration: HerdrConfiguration;
      version: string;
      protocol: number;
      endpoint: string;
    }>
  | Readonly<{
      kind: "incompatible";
      configuration: HerdrConfiguration;
      version?: string;
      protocol?: number;
      endpoint?: string;
    }>
  | Readonly<{
      kind: "error";
      configuration: HerdrConfiguration;
      diagnostic: string;
    }>;

export type HerdrSessionDiscovery = Exclude<
  HerdrSessionCatalogState,
  Readonly<{ kind: "checking"; configuration: HerdrConfiguration }>
>;

export interface HerdrConfigurationSource {
  read(): HerdrConfiguration;
  onDidChange(listener: () => void): { dispose(): void };
}

export interface HerdrSessionDirectory {
  discover(configuration: HerdrConfiguration): Promise<HerdrSessionDiscovery>;
  start(configuration: HerdrConfiguration): Promise<void>;
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

export interface HerdrConfigurationActions {
  selectExecutable(): Promise<void>;
  openSettings(): Promise<void>;
}

export type HerdrCommandHandlers = Readonly<{
  showStatusActions(): Promise<void>;
  retryDiscovery(): Promise<void>;
  start(): Promise<void>;
  selectExecutable(): Promise<void>;
  openSettings(): Promise<void>;
}>;

export interface HerdrCommandRegistry {
  register(handlers: HerdrCommandHandlers): { dispose(): void };
}
