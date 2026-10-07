import * as vscode from "vscode";
import { CloseFeature } from "@features/close";
import { CreatePaneFeature } from "@features/create-pane";
import { CreateSpaceFeature } from "@features/create-space";
import { RenameFeature } from "@features/rename";
import { RevealPaneFeature } from "@features/reveal-pane";
import { RunNpmScriptFeature } from "@features/run-npm-script";
import { SessionsModel } from "@modules/sessions";
import { NavigationContextModel } from "@modules/workspace-context";
import { VsCodeNpmScriptsView } from "@views/npm-scripts";
import {
  VisiblePaneEditorDecorationProvider,
  VsCodeAgentsView,
  VsCodePanesView,
  VsCodeSessionsView,
  VsCodeSpacesView,
} from "@views/sidebar";
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
  private readonly navigationContext: NavigationContextModel;
  private readonly panes: VsCodePanesView;
  private readonly spaces: VsCodeSpacesView;
  private readonly npmScripts: VsCodeNpmScriptsView;
  private readonly runNpmScript: RunNpmScriptFeature;
  private readonly agents: VsCodeAgentsView;
  private readonly decorationProvider: VisiblePaneEditorDecorationProvider;
  private readonly decorations: vscode.Disposable;
  private readonly createSpace: CreateSpaceFeature;
  private readonly createPane: CreatePaneFeature;
  private readonly rename: RenameFeature;
  private readonly close: CloseFeature;
  private readonly revealPane: RevealPaneFeature;
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
    let navigationContext: NavigationContextModel | undefined;
    let panes: VsCodePanesView | undefined;
    let spaces: VsCodeSpacesView | undefined;
    let npmScripts: VsCodeNpmScriptsView | undefined;
    let runNpmScript: RunNpmScriptFeature | undefined;
    let agents: VsCodeAgentsView | undefined;
    let decorationProvider: VisiblePaneEditorDecorationProvider | undefined;
    let decorations: vscode.Disposable | undefined;
    let createSpace: CreateSpaceFeature | undefined;
    let createPane: CreatePaneFeature | undefined;
    let rename: RenameFeature | undefined;
    let close: CloseFeature | undefined;
    let revealPane: RevealPaneFeature | undefined;
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
      navigationContext = new NavigationContextModel(sessionOwner, surfaceManager);
      panes = new VsCodePanesView(navigationContext, navigationContext, surfaceManager, sessionOwner);
      spaces = new VsCodeSpacesView(navigationContext, navigationContext);
      npmScripts = new VsCodeNpmScriptsView(navigationContext);
      runNpmScript = new RunNpmScriptFeature(navigationContext, sessionOwner, surfaceManager, npmScripts);
      agents = new VsCodeAgentsView(navigationContext, navigationContext);
      decorationProvider = new VisiblePaneEditorDecorationProvider(navigationContext, navigationContext);
      decorations = vscode.window.registerFileDecorationProvider(decorationProvider);
      createSpace = new CreateSpaceFeature(navigationContext, navigationContext, sessionOwner, surfaceManager);
      createPane = new CreatePaneFeature(navigationContext, sessionOwner, surfaceManager);
      rename = new RenameFeature(navigationContext, sessionOwner);
      close = new CloseFeature(navigationContext, sessionOwner, surfaceManager);
      revealPane = new RevealPaneFeature(navigationContext, navigationContext, surfaceManager);
      this.logger = logger;
      this.sessions = sessionOwner;
      this.sessionsView = sessionsView;
      this.status = status;
      this.startLocalSession = startLocalSession;
      this.configureExecutable = configureExecutable;
      this.paneEditorSelection = selection;
      this.paneEditorFocusTracker = focusTracker;
      this.paneTerminalSurfaceManager = surfaceManager;
      this.navigationContext = navigationContext;
      this.panes = panes;
      this.spaces = spaces;
      this.npmScripts = npmScripts;
      this.runNpmScript = runNpmScript;
      this.agents = agents;
      this.decorationProvider = decorationProvider;
      this.decorations = decorations;
      this.createSpace = createSpace;
      this.createPane = createPane;
      this.rename = rename;
      this.close = close;
      this.revealPane = revealPane;
      this.takeoverPopupHost = popupHost;
      this.takeoverPluginRegistration = takeoverPluginRegistration;
      this.manageTakeoverPlugin = manageTakeoverPlugin;
    } catch (error) {
      revealPane?.dispose();
      close?.dispose();
      rename?.dispose();
      createPane?.dispose();
      createSpace?.dispose();
      decorations?.dispose();
      decorationProvider?.dispose();
      agents?.dispose();
      runNpmScript?.dispose();
      npmScripts?.dispose();
      spaces?.dispose();
      panes?.dispose();
      navigationContext?.dispose();
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
    this.revealPane.dispose();
    this.close.dispose();
    this.rename.dispose();
    this.createPane.dispose();
    this.createSpace.dispose();
    this.decorations.dispose();
    this.decorationProvider.dispose();
    this.agents.dispose();
    this.runNpmScript.dispose();
    this.npmScripts.dispose();
    this.spaces.dispose();
    this.panes.dispose();
    this.navigationContext.dispose();
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
