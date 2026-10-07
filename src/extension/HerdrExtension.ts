import * as vscode from "vscode";
import { NavigationFeature } from "@features/navigation";
import { SessionsModel } from "@modules/sessions";
import { VsCodeSessionsView } from "@views/sidebar";
import { ConnectionStatus } from "@views/connection-status";
import { StartLocalSessionFeature } from "@features/start-local-session";
import { ConfigureExecutableFeature } from "@features/configure-executable";
import { ManageTakeoverPluginFeature } from "@features/manage-takeover-plugin";
import {
  HerdrPaneClientFactory,
  HerdrCliSessionDirectory,
  JsonSocketHerdrSessionConnectionFactory,
  NodeHerdrSocketConnector,
  TakeoverPluginRegistration,
  TakeoverPopupHost,
} from "@api/herdr";
import {
  PaneEditorFocusTracker,
  PaneEditorSelectionModel,
  PaneTerminalSurfaceManager,
  VsCodePaneTerminalSurface,
} from "@modules/pane-editors";
import { HerdrSettings } from "./HerdrSettings";
import { VsCodeLogger } from "@core/logger";
import { NodeProcessRunner } from "@core/process";

export class HerdrExtension implements vscode.Disposable {
  private readonly logger: VsCodeLogger;
  private readonly sessions: SessionsModel;
  private readonly sessionsView: VsCodeSessionsView;
  private readonly status: ConnectionStatus;
  private readonly startLocalSession: StartLocalSessionFeature;
  private readonly configureExecutable: ConfigureExecutableFeature;
  private readonly paneEditorSelection: PaneEditorSelectionModel;
  private readonly paneEditorFocusTracker: PaneEditorFocusTracker;
  private readonly paneTerminalSurfaceManager: PaneTerminalSurfaceManager;
  private readonly navigation: NavigationFeature;
  private readonly takeoverPopupHost: TakeoverPopupHost;
  private readonly takeoverPluginRegistration: TakeoverPluginRegistration;
  private readonly manageTakeoverPlugin: ManageTakeoverPluginFeature;
  private disposed = false;

  constructor(context: vscode.ExtensionContext) {
    const logger = new VsCodeLogger("Herdr");
    let sessions: SessionsModel | undefined;
    let sessionsView: VsCodeSessionsView | undefined;
    let status: ConnectionStatus | undefined;
    let startLocalSession: StartLocalSessionFeature | undefined;
    let configureExecutable: ConfigureExecutableFeature | undefined;
    let paneEditorSelection: PaneEditorSelectionModel | undefined;
    let paneEditorFocusTracker: PaneEditorFocusTracker | undefined;
    let paneTerminalSurfaceManager: PaneTerminalSurfaceManager | undefined;
    let navigation: NavigationFeature | undefined;
    let takeoverPopupHost: TakeoverPopupHost | undefined;
    let manageTakeoverPlugin: ManageTakeoverPluginFeature | undefined;
    try {
      const configuration = new HerdrSettings();
      const takeoverPluginRegistration = new TakeoverPluginRegistration(
        configuration,
        logger,
        context.asAbsolutePath("dist/herdr-plugin"),
        vscode.Uri.joinPath(context.globalStorageUri, "herdr-plugin").fsPath,
      );
      manageTakeoverPlugin = new ManageTakeoverPluginFeature(takeoverPluginRegistration, logger);
      const popupHost = new TakeoverPopupHost(configuration, takeoverPluginRegistration, logger);
      takeoverPopupHost = popupHost;
      sessions = new SessionsModel(
        new HerdrCliSessionDirectory(new NodeProcessRunner()),
        new JsonSocketHerdrSessionConnectionFactory(logger, new NodeHerdrSocketConnector()),
        configuration,
        context.workspaceState,
        logger,
      );
      const sessionOwner = sessions;
      sessionsView = new VsCodeSessionsView(sessionOwner, sessionOwner);
      startLocalSession = new StartLocalSessionFeature(sessionOwner);
      configureExecutable = new ConfigureExecutableFeature();
      status = new ConnectionStatus(sessionOwner, sessionOwner, startLocalSession, configureExecutable, logger);
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
        paneClosing: surfaceManager,
        paneEditorPresence: surfaceManager,
        creation: sessionOwner,
        management: sessionOwner,
      });
      navigation = navigationFeature;
      this.logger = logger;
      this.sessions = sessionOwner;
      this.sessionsView = sessionsView;
      this.status = status;
      this.startLocalSession = startLocalSession;
      this.configureExecutable = configureExecutable;
      this.paneEditorSelection = selection;
      this.paneEditorFocusTracker = focusTracker;
      this.paneTerminalSurfaceManager = surfaceManager;
      this.navigation = navigationFeature;
      this.takeoverPopupHost = popupHost;
      this.takeoverPluginRegistration = takeoverPluginRegistration;
      this.manageTakeoverPlugin = manageTakeoverPlugin;
    } catch (error) {
      navigation?.dispose();
      paneTerminalSurfaceManager?.dispose();
      takeoverPopupHost?.dispose();
      paneEditorFocusTracker?.dispose();
      paneEditorSelection?.dispose();
      status?.dispose();
      configureExecutable?.dispose();
      startLocalSession?.dispose();
      sessionsView?.dispose();
      sessions?.dispose();
      manageTakeoverPlugin?.dispose();
      logger.dispose();
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (this.disposed) return;
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
    this.status.dispose();
    this.configureExecutable.dispose();
    this.startLocalSession.dispose();
    this.sessionsView.dispose();
    this.sessions.dispose();
    this.manageTakeoverPlugin.dispose();
    this.logger.dispose();
  }
}
