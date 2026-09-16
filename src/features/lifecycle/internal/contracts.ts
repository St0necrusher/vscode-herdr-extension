export type HerdrSettings = Readonly<{
  executable: string;
  session: string;
}>;

export type HerdrAvailability =
  | Readonly<{ kind: "checking"; settings: HerdrSettings }>
  | Readonly<{
      kind: "missing-binary";
      settings: HerdrSettings;
      detail: string;
    }>
  | Readonly<{ kind: "stopped"; settings: HerdrSettings; detail: string }>
  | Readonly<{
      kind: "connected";
      settings: HerdrSettings;
      detail: string;
      version: string;
      protocol: number;
      endpoint: string;
    }>
  | Readonly<{
      kind: "incompatible";
      settings: HerdrSettings;
      detail: string;
      version?: string;
      protocol?: number;
      endpoint?: string;
    }>
  | Readonly<{ kind: "error"; settings: HerdrSettings; detail: string }>;

export type HerdrDiscoveryResult = Exclude<
  HerdrAvailability,
  Readonly<{ kind: "checking"; settings: HerdrSettings }>
>;

export interface HerdrLifecyclePort {
  inspect(settings: HerdrSettings): Promise<HerdrDiscoveryResult>;
  start(settings: HerdrSettings): Promise<void>;
}

export interface HerdrSettingsPort {
  read(): HerdrSettings;
  onDidChange(listener: () => void): { dispose(): void };
}

export interface HerdrAvailabilityView {
  render(availability: HerdrAvailability): void;
}

export interface LifecycleLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface LifecycleFeature {
  activate(): Promise<void>;
  retry(): Promise<void>;
  start(): Promise<void>;
  getAvailability(): HerdrAvailability;
  dispose(): void;
}

export type LifecycleDependencies = Readonly<{
  herdr: HerdrLifecyclePort;
  settings: HerdrSettingsPort;
  view: HerdrAvailabilityView;
  logger: LifecycleLogger;
}>;
