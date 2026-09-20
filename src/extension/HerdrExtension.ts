import type * as vscode from "vscode";
import { SessionsFeature } from "#features/sessions";
import {
  HerdrCliSessionDirectory,
  JsonSocketHerdrSessionConnectionFactory,
  NodeHerdrSocketConnector,
  NodeProcessRunner,
} from "#infrastructure/herdr";
import { VsCodeHerdrConfiguration, VsCodeHerdrLogger } from "#infrastructure/vscode";

export class HerdrExtension implements vscode.Disposable {
  private readonly logger: VsCodeHerdrLogger;
  private readonly sessions: SessionsFeature;
  private disposed = false;

  constructor(context: vscode.ExtensionContext) {
    const logger = new VsCodeHerdrLogger();
    try {
      const configuration = new VsCodeHerdrConfiguration();
      this.logger = logger;
      this.sessions = new SessionsFeature({
        directory: new HerdrCliSessionDirectory(new NodeProcessRunner()),
        connectionFactory: new JsonSocketHerdrSessionConnectionFactory(logger, new NodeHerdrSocketConnector()),
        configuration,
        configurationActions: configuration,
        storage: context.workspaceState,
        logger,
      });
    } catch (error) {
      logger.dispose();
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
    this.logger.dispose();
  }
}
