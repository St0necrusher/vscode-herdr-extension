import type * as vscode from "vscode";
import { VsCodeSessionsFeature } from "#features/sessions";
import {
  HerdrCliSessionDirectory,
  NodeProcessRunner,
} from "#infrastructure/herdr";
import {
  VsCodeHerdrConfiguration,
  VsCodeHerdrLogger,
} from "#infrastructure/vscode";

export class HerdrExtension implements vscode.Disposable {
  private readonly logger: VsCodeHerdrLogger;
  private readonly sessions: VsCodeSessionsFeature;
  private disposed = false;

  constructor() {
    this.logger = new VsCodeHerdrLogger();
    const configuration = new VsCodeHerdrConfiguration();
    this.sessions = new VsCodeSessionsFeature({
      directory: new HerdrCliSessionDirectory(new NodeProcessRunner()),
      configuration,
      configurationActions: configuration,
      logger: this.logger,
    });
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
