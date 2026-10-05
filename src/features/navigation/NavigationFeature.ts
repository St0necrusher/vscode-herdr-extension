import * as vscode from "vscode";
import type {
  ActiveSessionCreation,
  ActiveSessionManagement,
  ActiveSessionProjectionSource,
} from "@capabilities/sessions";
import type {
  PaneEditorPresenceSource,
  PaneTerminalClosing,
  PaneTerminalOpening,
} from "@capabilities/terminalSurfaces";
import { AgentsFeature } from "./agents";
import { NavigationContextModel } from "./NavigationContextModel";
import { PanesFeature } from "./panes";
import { ScriptsFeature } from "./scripts";
import { SpacesFeature } from "./spaces";
import { VisiblePaneEditorDecorationProvider } from "./shared/view";

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
  private readonly panes: PanesFeature;
  private readonly spaces: SpacesFeature;
  private readonly scripts: ScriptsFeature;
  private readonly agents: AgentsFeature;
  private readonly decorationProvider: VisiblePaneEditorDecorationProvider;
  private readonly decorations: vscode.Disposable;
  private disposed = false;

  constructor(dependencies: NavigationFeatureDependencies) {
    const context = new NavigationContextModel(dependencies.sessionProjection, dependencies.paneEditorPresence);
    const panes = new PanesFeature(
      context,
      context,
      dependencies.paneTerminalOpening,
      dependencies.creation,
      dependencies.management,
      dependencies.paneClosing,
    );
    const spaces = new SpacesFeature(
      context,
      context,
      dependencies.creation,
      panes,
      dependencies.management,
      dependencies.paneClosing,
    );
    this.context = context;
    this.panes = panes;
    this.spaces = spaces;
    this.scripts = new ScriptsFeature(context, dependencies.creation, panes);
    this.agents = new AgentsFeature(context, context, panes, context);
    this.decorationProvider = new VisiblePaneEditorDecorationProvider(context, context);
    this.decorations = vscode.window.registerFileDecorationProvider(this.decorationProvider);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.decorations.dispose();
    this.decorationProvider.dispose();
    this.agents.dispose();
    this.scripts.dispose();
    this.spaces.dispose();
    this.panes.dispose();
    this.context.dispose();
  }
}
