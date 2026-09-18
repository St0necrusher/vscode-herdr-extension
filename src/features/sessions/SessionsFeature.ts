import type { HerdrLogger } from "#capabilities/runtime";
import type {
  HerdrConfigurationActions,
  HerdrConfigurationSource,
  HerdrSessionDirectory,
} from "#capabilities/sessions";
import { HerdrSessionsService } from "./catalog/index.js";
import { HerdrStatusController } from "./status/index.js";
import { VsCodeHerdrCommands, VsCodeHerdrStatusView } from "./vscode/index.js";

export type SessionsFeatureDependencies = Readonly<{
  directory: HerdrSessionDirectory;
  configuration: HerdrConfigurationSource;
  configurationActions: HerdrConfigurationActions;
  logger: HerdrLogger;
}>;

export class SessionsFeature {
  private readonly catalog: HerdrSessionsService;
  private readonly statusView: VsCodeHerdrStatusView;
  private readonly status: HerdrStatusController;
  private readonly commands: VsCodeHerdrCommands;
  private disposed = false;
  private initialization: Promise<void> | undefined;

  constructor(dependencies: SessionsFeatureDependencies) {
    this.catalog = new HerdrSessionsService(
      dependencies.directory,
      dependencies.configuration,
      dependencies.logger,
    );
    let statusView: VsCodeHerdrStatusView | undefined;
    let status: HerdrStatusController | undefined;

    try {
      statusView = new VsCodeHerdrStatusView(dependencies.logger);
      status = new HerdrStatusController(
        this.catalog,
        this.catalog,
        statusView,
        dependencies.configurationActions,
        dependencies.logger,
      );
      this.commands = new VsCodeHerdrCommands(
        this.catalog,
        status,
        dependencies.configurationActions,
      );
      this.statusView = statusView;
      this.status = status;
    } catch (error) {
      status?.dispose();
      statusView?.dispose();
      this.catalog.dispose();
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (this.disposed) return;
    this.initialization ??= this.initializeResources();
    await this.initialization;
  }

  private async initializeResources(): Promise<void> {
    // Cache the shared initialization before any callbacks can reenter it.
    await Promise.resolve();
    if (this.disposed) return;
    try {
      this.commands.register();
      await this.catalog.initialize();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.commands.dispose();
    this.status.dispose();
    this.statusView.dispose();
    this.catalog.dispose();
  }
}
