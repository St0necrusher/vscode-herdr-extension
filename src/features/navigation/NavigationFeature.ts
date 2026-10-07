import * as vscode from "vscode";
import type { ActiveSessionCreation, ActiveSessionManagement } from "@modules/sessions";
import type { PaneTerminalClosing, PaneTerminalOpening } from "@modules/pane-editors";
import {
  NavigationContextModel,
  type ActiveSessionProjectionSource,
  type PaneEditorPresenceSource,
} from "@modules/workspace-context";
import { CloseFeature } from "@features/close";
import { CreatePaneFeature } from "@features/create-pane";
import { CreateSpaceFeature } from "@features/create-space";
import { RenameFeature } from "@features/rename";
import { RevealPaneFeature } from "@features/reveal-pane";
import {
  VisiblePaneEditorDecorationProvider,
  VsCodeAgentsView,
  VsCodePanesView,
  VsCodeSpacesView,
} from "@views/sidebar";
import { ScriptsFeature } from "./scripts";

export type NavigationFeatureDependencies = Readonly<{
  sessionProjection: ActiveSessionProjectionSource;
  paneTerminalOpening: PaneTerminalOpening;
  paneClosing: PaneTerminalClosing;
  paneEditorPresence: PaneEditorPresenceSource;
  creation: ActiveSessionCreation;
  management: ActiveSessionManagement;
}>;

export class NavigationFeature {
  private readonly context: NavigationContextModel;
  private readonly panes: VsCodePanesView;
  private readonly spaces: VsCodeSpacesView;
  private readonly scripts: ScriptsFeature;
  private readonly agents: VsCodeAgentsView;
  private readonly decorationProvider: VisiblePaneEditorDecorationProvider;
  private readonly decorations: vscode.Disposable;
  private readonly createSpace: CreateSpaceFeature;
  private readonly createPane: CreatePaneFeature;
  private readonly rename: RenameFeature;
  private readonly close: CloseFeature;
  private readonly revealPane: RevealPaneFeature;
  private disposed = false;

  constructor(dependencies: NavigationFeatureDependencies) {
    const context = new NavigationContextModel(dependencies.sessionProjection, dependencies.paneEditorPresence);
    const panes = new VsCodePanesView(context, context, dependencies.paneTerminalOpening, dependencies.management);
    const spaces = new VsCodeSpacesView(context, context);
    const scripts = new ScriptsFeature(context, dependencies.creation, dependencies.paneTerminalOpening);
    const agents = new VsCodeAgentsView(context, context);
    const decorationProvider = new VisiblePaneEditorDecorationProvider(context, context);
    const decorations = vscode.window.registerFileDecorationProvider(decorationProvider);
    const createSpace = new CreateSpaceFeature(
      context,
      context,
      dependencies.creation,
      dependencies.paneTerminalOpening,
    );
    const createPane = new CreatePaneFeature(context, dependencies.creation, dependencies.paneTerminalOpening);
    const rename = new RenameFeature(context, dependencies.management);
    const close = new CloseFeature(context, dependencies.management, dependencies.paneClosing);
    const revealPane = new RevealPaneFeature(context, context, dependencies.paneTerminalOpening);

    this.context = context;
    this.panes = panes;
    this.spaces = spaces;
    this.scripts = scripts;
    this.agents = agents;
    this.decorationProvider = decorationProvider;
    this.decorations = decorations;
    this.createSpace = createSpace;
    this.createPane = createPane;
    this.rename = rename;
    this.close = close;
    this.revealPane = revealPane;
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
    this.scripts.dispose();
    this.spaces.dispose();
    this.panes.dispose();
    this.context.dispose();
  }
}
