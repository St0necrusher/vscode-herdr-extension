import type { HerdrLogger } from "#capabilities/runtime";
import type {
  HerdrConfigurationActions,
  HerdrConfigurationSource,
  HerdrSessionDirectory,
} from "#capabilities/sessions";
import { SessionsFeature } from "./SessionsFeature.js";
import {
  VsCodeHerdrCommandRegistry,
  VsCodeHerdrStatusView,
} from "./vscode/index.js";

export type VsCodeSessionsFeatureDependencies = Readonly<{
  directory: HerdrSessionDirectory;
  configuration: HerdrConfigurationSource;
  configurationActions: HerdrConfigurationActions;
  logger: HerdrLogger;
}>;

export class VsCodeSessionsFeature {
  private readonly sessions: SessionsFeature;
  private readonly statusView: VsCodeHerdrStatusView;
  private disposed = false;

  constructor(dependencies: VsCodeSessionsFeatureDependencies) {
    const statusView = new VsCodeHerdrStatusView(dependencies.logger);

    try {
      this.sessions = new SessionsFeature({
        directory: dependencies.directory,
        configuration: dependencies.configuration,
        statusView,
        configurationActions: dependencies.configurationActions,
        commands: new VsCodeHerdrCommandRegistry(),
        logger: dependencies.logger,
      });
      this.statusView = statusView;
    } catch (error) {
      statusView.dispose();
      throw error;
    }
  }

  async initialize(): Promise<void> {
    try {
      await this.sessions.initialize();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sessions.dispose();
    this.statusView.dispose();
  }
}
