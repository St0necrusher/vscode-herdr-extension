import * as vscode from "vscode";
import { CloseFeature } from "@features/close";
import { CreatePaneFeature } from "@features/create-pane";
import { CreateSpaceFeature } from "@features/create-space";
import { RenameFeature } from "@features/rename";
import { RevealPaneFeature } from "@features/reveal-pane";
import { OpenTabFeature } from "@features/open-tab";
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
  private readonly disposables: vscode.Disposable[];
  private readonly sessions: SessionsModel;
  private readonly takeoverPluginRegistration: TakeoverPluginRegistration;
  private disposed = false;

  constructor(context: vscode.ExtensionContext) {
    const disposables: vscode.Disposable[] = [];
    this.disposables = disposables;
    // Released front to back: reverse construction, except that objects passed as
    // `disposeAfter: popupHost` are released after the popup host, which goes between
    // the surface manager and the focus tracker.
    const acquire = <T extends vscode.Disposable>(resource: T, disposeAfter?: vscode.Disposable): T => {
      const insertionIndex = disposeAfter === undefined ? 0 : disposables.indexOf(disposeAfter) + 1;
      disposables.splice(insertionIndex, 0, resource);
      return resource;
    };
    const logger = acquire(new VsCodeLogger("Herdr"));
    try {
      const configuration = new HerdrSettings();
      const takeoverPluginRegistration = acquire(
        new TakeoverPluginRegistration(
          configuration,
          logger,
          context.asAbsolutePath("dist/herdr-plugin"),
          vscode.Uri.joinPath(context.globalStorageUri, "herdr-plugin").fsPath,
        ),
      );
      acquire(new ManageTakeoverPluginFeature(takeoverPluginRegistration, logger));
      const popupHost = acquire(new TakeoverPopupHost(configuration, takeoverPluginRegistration, logger));
      const sessions = acquire(
        new SessionsModel(
          new HerdrCliSessionDirectory(new NodeProcessRunner()),
          new JsonSocketHerdrSessionConnectionFactory(logger, new NodeHerdrSocketConnector()),
          configuration,
          context.workspaceState,
          logger,
        ),
        popupHost,
      );
      acquire(new VsCodeSessionsView(sessions, sessions), popupHost);
      const configureExecutable = acquire(new ConfigureExecutableFeature(), popupHost);
      acquire(new ConnectionStatus(sessions, sessions, configureExecutable, logger), popupHost);
      const selection = acquire(new PaneEditorSelectionModel(), popupHost);
      const focusTracker = acquire(new PaneEditorFocusTracker(selection), popupHost);
      const paneClients = new HerdrPaneClientFactory(
        configuration,
        context.asAbsolutePath("resources/herdr-direct-attach.toml"),
        logger,
      );
      const surfaceManager = acquire(
        new PaneTerminalSurfaceManager(selection, sessions, {
          create: (paneSelection, viewColumn, terminalName) =>
            new VsCodePaneTerminalSurface(
              paneSelection,
              viewColumn,
              terminalName,
              sessions,
              focusTracker,
              paneClients,
              popupHost,
              logger,
            ),
        }),
      );
      const navigationContext = acquire(new NavigationContextModel(sessions, surfaceManager));
      acquire(new VsCodePanesView(navigationContext, navigationContext, surfaceManager, sessions));
      acquire(new VsCodeSpacesView(navigationContext, navigationContext));
      const runNpmScript = acquire(new RunNpmScriptFeature(navigationContext, sessions, surfaceManager));
      acquire(new VsCodeNpmScriptsView(navigationContext, runNpmScript));
      acquire(new VsCodeAgentsView(navigationContext, navigationContext));
      acquire(new VisiblePaneEditorDecorationProvider(navigationContext, navigationContext));
      acquire(new CreateSpaceFeature(navigationContext, navigationContext, sessions, surfaceManager));
      acquire(new CreatePaneFeature(navigationContext, sessions, surfaceManager));
      acquire(new RenameFeature(navigationContext, sessions));
      acquire(new CloseFeature(navigationContext, sessions, surfaceManager));
      acquire(new RevealPaneFeature(navigationContext, navigationContext, surfaceManager));
      acquire(new OpenTabFeature(navigationContext, surfaceManager));
      this.sessions = sessions;
      this.takeoverPluginRegistration = takeoverPluginRegistration;
    } catch (error) {
      for (const disposable of disposables) disposable.dispose();
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
    for (const disposable of this.disposables) disposable.dispose();
  }
}
