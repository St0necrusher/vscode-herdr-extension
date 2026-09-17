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

export interface HerdrConfigurationActions {
  selectExecutable(): Promise<void>;
  openSettings(): Promise<void>;
}
