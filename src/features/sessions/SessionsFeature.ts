import type { HerdrLogger } from "../../capabilities/runtime/index.js";
import type {
  HerdrCommandRegistry,
  HerdrConfigurationActions,
  HerdrConfigurationSource,
  HerdrSessionCatalogState,
  HerdrSessionDirectory,
  HerdrStatusView,
} from "../../capabilities/sessions/index.js";
import { HerdrSessionsService } from "./catalog/index.js";
import { HerdrSessionsCommandsController } from "./commands/index.js";
import { HerdrStatusController } from "./status/index.js";

export type SessionsFeatureDependencies = Readonly<{
  directory: HerdrSessionDirectory;
  configuration: HerdrConfigurationSource;
  statusView: HerdrStatusView;
  configurationActions: HerdrConfigurationActions;
  commands: HerdrCommandRegistry;
  logger: HerdrLogger;
}>;

export class SessionsFeature {
  readonly #catalog: HerdrSessionsService;
  readonly #status: HerdrStatusController;
  readonly #commands: HerdrSessionsCommandsController;
  #disposed = false;

  constructor(dependencies: SessionsFeatureDependencies) {
    this.#catalog = new HerdrSessionsService(
      dependencies.directory,
      dependencies.configuration,
      dependencies.logger,
    );
    this.#status = new HerdrStatusController(
      this.#catalog,
      this.#catalog,
      dependencies.statusView,
      dependencies.configurationActions,
      dependencies.logger,
    );
    this.#commands = new HerdrSessionsCommandsController(
      dependencies.commands,
      this.#catalog,
      this.#status,
      dependencies.configurationActions,
    );
  }

  initialize(): Promise<void> {
    return this.#catalog.initialize();
  }

  retry(): Promise<void> {
    return this.#catalog.retry();
  }

  start(): Promise<void> {
    return this.#catalog.start();
  }

  getCatalogState(): HerdrSessionCatalogState {
    return this.#catalog.getState();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#commands.dispose();
    this.#status.dispose();
    this.#catalog.dispose();
  }
}
