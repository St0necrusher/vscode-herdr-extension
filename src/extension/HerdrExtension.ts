import type * as vscode from "vscode";
import { SessionsFeature } from "../features/sessions/index.js";
import {
  HerdrCliSessionDirectory,
  NodeProcessRunner,
} from "../infrastructure/herdr/index.js";
import {
  VsCodeHerdrCommandRegistry,
  VsCodeHerdrConfiguration,
  VsCodeHerdrLogger,
  VsCodeHerdrStatusView,
} from "../infrastructure/vscode/index.js";

export class HerdrExtension implements vscode.Disposable {
  readonly #logger: VsCodeHerdrLogger;
  readonly #statusView: VsCodeHerdrStatusView;
  readonly #sessions: SessionsFeature;
  #disposed = false;

  constructor() {
    this.#logger = new VsCodeHerdrLogger();
    this.#statusView = new VsCodeHerdrStatusView(this.#logger);
    const configuration = new VsCodeHerdrConfiguration();
    this.#sessions = new SessionsFeature({
      directory: new HerdrCliSessionDirectory(new NodeProcessRunner()),
      configuration,
      statusView: this.#statusView,
      configurationActions: configuration,
      commands: new VsCodeHerdrCommandRegistry(),
      logger: this.#logger,
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.#sessions.initialize();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#sessions.dispose();
    this.#statusView.dispose();
    this.#logger.dispose();
  }
}
