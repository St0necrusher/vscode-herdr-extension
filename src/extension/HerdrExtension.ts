import type * as vscode from "vscode";
import { NavigationFeature } from "@features/navigation";
import { TerminalSurfacesFeature } from "@features/terminal-surfaces";
import { SessionsFeature } from "@features/sessions";
import {
  HerdrCliSessionDirectory,
  HerdrCliTerminalObserverFactory,
  JsonSocketHerdrSessionConnectionFactory,
  NodeHerdrSocketConnector,
  NodeProcessRunner,
} from "@infrastructure/herdr";
import { VsCodeHerdrConfiguration, VsCodeHerdrLogger } from "@infrastructure/vscode";

export class HerdrExtension implements vscode.Disposable {
  private readonly logger: VsCodeHerdrLogger;
  private readonly sessions: SessionsFeature;
  private readonly terminalSurfaces: TerminalSurfacesFeature;
  private readonly navigation: NavigationFeature;
  private disposed = false;

  constructor(context: vscode.ExtensionContext) {
    const logger = new VsCodeHerdrLogger();
    let sessions: SessionsFeature | undefined;
    let terminalSurfaces: TerminalSurfacesFeature | undefined;
    let navigation: NavigationFeature | undefined;
    try {
      const configuration = new VsCodeHerdrConfiguration();
      sessions = new SessionsFeature({
        directory: new HerdrCliSessionDirectory(new NodeProcessRunner()),
        connectionFactory: new JsonSocketHerdrSessionConnectionFactory(logger, new NodeHerdrSocketConnector()),
        configuration,
        configurationActions: configuration,
        storage: context.workspaceState,
        logger,
      });
      terminalSurfaces = new TerminalSurfacesFeature({
        sessionProjection: sessions,
        observerFactory: new HerdrCliTerminalObserverFactory(logger),
        configuration,
        logger,
      });
      navigation = new NavigationFeature({
        sessionProjection: sessions,
        paneTerminalOpening: terminalSurfaces,
      });
      this.logger = logger;
      this.sessions = sessions;
      this.terminalSurfaces = terminalSurfaces;
      this.navigation = navigation;
    } catch (error) {
      navigation?.dispose();
      terminalSurfaces?.dispose();
      sessions?.dispose();
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
    this.navigation.dispose();
    this.terminalSurfaces.dispose();
    this.sessions.dispose();
    this.logger.dispose();
  }
}
