/** Configuration read afresh before every discovery or explicit start. */
export type HerdrSettings = Readonly<{
  executable: string;
  session: string;
}>;

/**
 * User-visible discovery state. `checking` is transient; every other variant is
 * stable until retry or a relevant settings change. Details are safe to log.
 */
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

/**
 * Boundary to the official Herdr executable. Inspection must not start Herdr.
 * `start` launches only Herdr's own selected Session server and resolves once
 * that process has spawned; callers must inspect again to learn readiness.
 */
export interface HerdrLifecyclePort {
  inspect(settings: HerdrSettings): Promise<HerdrDiscoveryResult>;
  start(settings: HerdrSettings): Promise<void>;
}

/** Emits after either lifecycle setting changes; disposal stops delivery. */
export interface HerdrSettingsPort {
  read(): HerdrSettings;
  onDidChange(listener: () => void): { dispose(): void };
}

/** Synchronously projects the latest availability into user-visible UI. */
export interface HerdrAvailabilityView {
  render(availability: HerdrAvailability): void;
}

export interface LifecycleLogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

/**
 * Discovery and explicit-start orchestration.
 *
 * `activate` subscribes to settings and performs exactly one discovery pass; it
 * never starts Herdr. Calls are idempotent. `start` is a no-op unless the last
 * completed state is `stopped`, then starts by explicit request and rediscovers.
 * Newer discovery requests supersede older results. `dispose` is idempotent,
 * unsubscribes settings, and prevents in-flight work from updating the view.
 */
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
