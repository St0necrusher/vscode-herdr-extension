import type { PaneTerminalOpening } from "@capabilities/terminalSurfaces";
import type { ActiveSessionProjectionSource } from "@capabilities/sessions";
import { NavigationContextModel } from "./NavigationContextModel";
import { PanesFeature } from "./panes";
import { SpacesFeature } from "./spaces";

export type NavigationFeatureDependencies = Readonly<{
  sessionProjection: ActiveSessionProjectionSource;
  paneTerminalOpening: PaneTerminalOpening;
}>;

export class NavigationFeature {
  private readonly context: NavigationContextModel;
  private readonly spaces: SpacesFeature;
  private readonly panes: PanesFeature;
  private disposed = false;

  constructor(dependencies: NavigationFeatureDependencies) {
    const context = new NavigationContextModel(dependencies.sessionProjection);
    const spaces = new SpacesFeature(context, context);
    const panes = new PanesFeature(context, dependencies.paneTerminalOpening);
    this.context = context;
    this.spaces = spaces;
    this.panes = panes;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.panes.dispose();
    this.spaces.dispose();
    this.context.dispose();
  }
}
