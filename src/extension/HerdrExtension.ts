import * as vscode from "vscode";
import { NavigationFeature } from "@features/navigation";
import { SessionsFeature } from "@features/sessions";
import {
  HerdrCliSessionDirectory,
  JsonSocketHerdrSessionConnectionFactory,
  NodeHerdrSocketConnector,
  NodeProcessRunner,
} from "@infrastructure/herdr";
import {
  HerdrPaneClientFactory,
  PaneEditorFocusTracker,
  PaneEditorSelectionModel,
  PaneTerminalSurfaceManager,
  TakeoverPluginRegistration,
  TakeoverPopupHost,
  VsCodePaneTerminalSurface,
} from "@infrastructure/pane-editors";
import { VsCodeHerdrConfiguration, VsCodeHerdrLogger } from "@infrastructure/vscode";

export class HerdrExtension implements vscode.Disposable {
  private readonly logger: VsCodeHerdrLogger;
  private readonly sessions: SessionsFeature;
  private readonly paneEditorSelection: PaneEditorSelectionModel;
  private readonly paneEditorFocusTracker: PaneEditorFocusTracker;
  private readonly paneTerminalSurfaceManager: PaneTerminalSurfaceManager;
  private readonly navigation: NavigationFeature;
  private readonly takeoverPopupHost: TakeoverPopupHost;
  private readonly takeoverPluginRegistration: TakeoverPluginRegistration;
  private disposed = false;

  constructor(context: vscode.ExtensionContext) {
    const logger = new VsCodeHerdrLogger();
    let sessions: SessionsFeature | undefined;
    let paneEditorSelection: PaneEditorSelectionModel | undefined;
    let paneEditorFocusTracker: PaneEditorFocusTracker | undefined;
    let paneTerminalSurfaceManager: PaneTerminalSurfaceManager | undefined;
    let navigation: NavigationFeature | undefined;
    let takeoverPopupHost: TakeoverPopupHost | undefined;
    let takeoverPluginRegistration: TakeoverPluginRegistration | undefined;
    try {
      const configuration = new VsCodeHerdrConfiguration();
      takeoverPluginRegistration = new TakeoverPluginRegistration(
        configuration,
        logger,
        context.asAbsolutePath("dist/herdr-plugin"),
        vscode.Uri.joinPath(context.globalStorageUri, "herdr-plugin").fsPath,
      );
      const popupHost = new TakeoverPopupHost(configuration, takeoverPluginRegistration, logger);
      takeoverPopupHost = popupHost;
      const sessionOwner = new SessionsFeature({
        directory: new HerdrCliSessionDirectory(new NodeProcessRunner()),
        connectionFactory: new JsonSocketHerdrSessionConnectionFactory(logger, new NodeHerdrSocketConnector()),
        configuration,
        configurationActions: configuration,
        storage: context.workspaceState,
        logger,
      });
      sessions = sessionOwner;
      paneEditorSelection = new PaneEditorSelectionModel();
      paneEditorFocusTracker = new PaneEditorFocusTracker(paneEditorSelection);
      const selection = paneEditorSelection;
      const focusTracker = paneEditorFocusTracker;
      const paneClients = new HerdrPaneClientFactory(
        configuration,
        context.asAbsolutePath("resources/herdr-direct-attach.toml"),
        logger,
      );
      const surfaceManager = new PaneTerminalSurfaceManager(selection, sessionOwner, {
        create: (paneSelection, viewColumn, terminalName) =>
          new VsCodePaneTerminalSurface(
            paneSelection,
            viewColumn,
            terminalName,
            sessionOwner,
            focusTracker,
            paneClients,
            popupHost,
            logger,
          ),
      });
      paneTerminalSurfaceManager = surfaceManager;
      const navigationFeature = new NavigationFeature({
        sessionProjection: sessionOwner,
        paneTerminalOpening: surfaceManager,
        creation: sessionOwner,
      });
      navigation = navigationFeature;
      this.logger = logger;
      this.sessions = sessionOwner;
      this.paneEditorSelection = selection;
      this.paneEditorFocusTracker = focusTracker;
      this.paneTerminalSurfaceManager = surfaceManager;
      this.navigation = navigationFeature;
      this.takeoverPopupHost = popupHost;
      this.takeoverPluginRegistration = takeoverPluginRegistration;
    } catch (error) {
      navigation?.dispose();
      paneTerminalSurfaceManager?.dispose();
      takeoverPopupHost?.dispose();
      paneEditorFocusTracker?.dispose();
      paneEditorSelection?.dispose();
      sessions?.dispose();
      takeoverPluginRegistration?.dispose();
      logger.dispose();
      throw error;
    }
  }

  async initialize(): Promise<void> {
    void this.takeoverPluginRegistration.initialize();
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
    this.paneTerminalSurfaceManager.dispose();
    this.takeoverPopupHost.dispose();
    this.paneEditorFocusTracker.dispose();
    this.paneEditorSelection.dispose();
    this.sessions.dispose();
    this.takeoverPluginRegistration.dispose();
    this.logger.dispose();
  }
}
