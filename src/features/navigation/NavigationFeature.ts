import type {
  ActiveSessionCreation,
  ActiveSessionManagement,
  ActiveSessionProjectionSource,
} from "@capabilities/sessions";
import type { PaneTerminalClosing, PaneTerminalOpening } from "@capabilities/terminalSurfaces";
import { NavigationContextModel } from "./NavigationContextModel";
import { PanesFeature } from "./panes";
import { ScriptsFeature } from "./scripts";
import { SpacesFeature } from "./spaces";

export type NavigationFeatureDependencies = Readonly<{
  sessionProjection: ActiveSessionProjectionSource;
  paneTerminalOpening: PaneTerminalOpening;
  paneClosing: PaneTerminalClosing;
  creation: ActiveSessionCreation;
  management: ActiveSessionManagement;
}>;

export class NavigationFeature {
  private readonly context: NavigationContextModel;
  private readonly panes: PanesFeature;
  private readonly spaces: SpacesFeature;
  private readonly scripts: ScriptsFeature;
  private disposed = false;

  constructor(dependencies: NavigationFeatureDependencies) {
    const context = new NavigationContextModel(dependencies.sessionProjection);
    const panes = new PanesFeature(
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
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scripts.dispose();
    this.spaces.dispose();
    this.panes.dispose();
    this.context.dispose();
  }
}
