import type { HerdrLogger } from "@capabilities/runtime";
import type { ActiveSessionProjectionSource, HerdrConfigurationSource } from "@capabilities/sessions";
import type {
  PaneTerminalOpening,
  PaneTerminalOpenRequest,
  HerdrTerminalObserverFactory,
} from "@capabilities/terminalSurfaces";
import { TerminalSurface } from "./TerminalSurface";
import { VsCodeTerminalSurfaceView } from "./view";

export type TerminalSurfacesFeatureDependencies = Readonly<{
  sessionProjection: ActiveSessionProjectionSource;
  observerFactory: HerdrTerminalObserverFactory;
  configuration: HerdrConfigurationSource;
  logger: HerdrLogger;
}>;

export class TerminalSurfacesFeature implements PaneTerminalOpening {
  private readonly sessionProjection: ActiveSessionProjectionSource;
  private readonly observerFactory: HerdrTerminalObserverFactory;
  private readonly configuration: HerdrConfigurationSource;
  private readonly logger: HerdrLogger;
  private readonly surfaces = new Map<string, TerminalSurface>();
  private readonly projectionSubscription: { dispose(): void };
  private disposed = false;

  constructor(dependencies: TerminalSurfacesFeatureDependencies) {
    this.sessionProjection = dependencies.sessionProjection;
    this.observerFactory = dependencies.observerFactory;
    this.configuration = dependencies.configuration;
    this.logger = dependencies.logger;
    this.projectionSubscription = this.sessionProjection.onDidChangeActiveSessionProjection((projection) => {
      for (const surface of this.surfaces.values()) surface.updateProjection(projection);
    });
  }

  openPane(request: PaneTerminalOpenRequest): void {
    if (this.disposed) return;
    const key = surfaceKey(request.sessionId, request.terminalId);
    const existing = this.surfaces.get(key);
    if (existing !== undefined) {
      existing.show();
      return;
    }

    const view = new VsCodeTerminalSurfaceView(request.name);
    const surface = new TerminalSurface(
      request,
      this.sessionProjection.getActiveSessionProjection(),
      this.observerFactory,
      this.configuration,
      this.logger,
      view,
      (closed) => this.removeSurface(key, closed),
    );
    this.surfaces.set(key, surface);
    surface.show();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.projectionSubscription.dispose();
    for (const surface of this.surfaces.values()) surface.dispose();
    this.surfaces.clear();
  }

  private removeSurface(key: string, surface: TerminalSurface): void {
    if (this.surfaces.get(key) === surface) this.surfaces.delete(key);
  }
}

function surfaceKey(sessionId: string, terminalId: string): string {
  return JSON.stringify([sessionId, terminalId]);
}
