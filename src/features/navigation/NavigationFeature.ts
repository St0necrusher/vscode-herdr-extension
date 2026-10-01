import type { PaneTerminalOpening } from "@capabilities/terminalSurfaces";
import type { ActiveSessionCreation, ActiveSessionProjectionSource } from "@capabilities/sessions";
import { NavigationContextModel } from "./NavigationContextModel";
import { PanesFeature } from "./panes";
import { SpacesFeature } from "./spaces";

export type NavigationFeatureDependencies = Readonly<{
  sessionProjection: ActiveSessionProjectionSource;
  paneTerminalOpening: PaneTerminalOpening;
  creation: ActiveSessionCreation;
}>;

export class NavigationFeature {
  private readonly context: NavigationContextModel;
  private readonly panes: PanesFeature;
  private readonly spaces: SpacesFeature;
  private disposed = false;

  constructor(dependencies: NavigationFeatureDependencies) {
    const context = new NavigationContextModel(dependencies.sessionProjection);
    const panes = new PanesFeature(context, dependencies.paneTerminalOpening, dependencies.creation);
    const spaces = new SpacesFeature(context, context, dependencies.creation, panes);
    this.context = context;
    this.panes = panes;
    this.spaces = spaces;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.spaces.dispose();
    this.panes.dispose();
    this.context.dispose();
  }
}
