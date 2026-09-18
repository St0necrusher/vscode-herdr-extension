import type { HerdrLogger } from "#capabilities/runtime";
import type { HerdrConfigurationSource, HerdrSessionCatalogState, HerdrSessionDirectory } from "#capabilities/sessions";
import type { HerdrSessionCatalogOperations, HerdrSessionCatalogStateSource } from "../capabilities/index.js";

export class HerdrSessionsService implements HerdrSessionCatalogStateSource, HerdrSessionCatalogOperations {
  private readonly directory: HerdrSessionDirectory;
  private readonly configuration: HerdrConfigurationSource;
  private readonly logger: HerdrLogger;
  private readonly listeners = new Set<(state: HerdrSessionCatalogState) => void>();
  private state: HerdrSessionCatalogState;
  private configurationSubscription: { dispose(): void } | undefined;
  private disposed = false;
  private revision = 0;

  constructor(directory: HerdrSessionDirectory, configuration: HerdrConfigurationSource, logger: HerdrLogger) {
    this.directory = directory;
    this.configuration = configuration;
    this.logger = logger;
    this.state = {
      kind: "checking",
      configuration: configuration.read(),
    };
  }

  async initialize(): Promise<void> {
    if (this.disposed) return;
    this.configurationSubscription = this.configuration.onDidChange(() => {
      void this.discover();
    });
    await this.discover();
  }

  getState(): HerdrSessionCatalogState {
    return this.state;
  }

  onDidChange(listener: (state: HerdrSessionCatalogState) => void): {
    dispose(): void;
  } {
    if (this.disposed) return { dispose: () => undefined };
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  async retry(): Promise<void> {
    await this.discover();
  }

  async start(): Promise<void> {
    if (this.disposed || this.state.kind !== "stopped") return;
    const configuration = this.configuration.read();
    const startRevision = this.revision;
    this.logger.info(`Starting Herdr Session "${configuration.session}" by explicit request.`);

    try {
      await this.directory.start(configuration);
      if (startRevision !== this.revision) return;
      await this.discover();
    } catch (error) {
      if (startRevision !== this.revision) return;
      this.publish({
        kind: "error",
        configuration,
        diagnostic: error instanceof Error ? error.message : String(error),
      });
      this.logger.error("Herdr startup failed.", error);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.revision += 1;
    this.configurationSubscription?.dispose();
    this.configurationSubscription = undefined;
    this.listeners.clear();
  }

  private async discover(): Promise<void> {
    if (this.disposed) return;
    const configuration = this.configuration.read();
    const requestRevision = ++this.revision;
    this.publish({ kind: "checking", configuration });
    this.logger.info(`Discovering Herdr Session "${configuration.session}" with ${configuration.executable}.`);

    try {
      const discovered = await this.directory.discover(configuration);
      if (requestRevision !== this.revision) return;
      this.publish(discovered);
      this.logger.info(`Herdr Session discovery result: ${discovered.kind}.`);
    } catch (error) {
      if (requestRevision !== this.revision) return;
      this.publish({
        kind: "error",
        configuration,
        diagnostic: error instanceof Error ? error.message : String(error),
      });
      this.logger.error("Herdr discovery failed.", error);
    }
  }

  private publish(state: HerdrSessionCatalogState): void {
    if (this.disposed) return;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
