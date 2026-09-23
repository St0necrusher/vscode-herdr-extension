import type { HerdrLogger } from "@capabilities/runtime";
import type { ActiveSessionProjectionState, HerdrConfigurationSource } from "@capabilities/sessions";
import type {
  HerdrTerminalObserverAttempt,
  HerdrTerminalObserverEvent,
  HerdrTerminalObserverFactory,
} from "@capabilities/terminalSurfaces";
type TerminalSurfaceRequest = Readonly<{
  sessionId: string;
  paneId: string;
  terminalId: string;
  name: string;
}>;

type ConnectingTerminalSurfaceState = Readonly<{ kind: "connecting" }>;
type LiveTerminalSurfaceState = Readonly<{ kind: "live" }>;
type DisconnectedTerminalSurfaceState = Readonly<{
  kind: "disconnected";
  phase: "waiting" | "paused";
}>;
type EndedTerminalSurfaceState = Readonly<{ kind: "ended" }>;
type FaultedTerminalSurfaceState = Readonly<{ kind: "faulted" }>;
type TerminalSurfaceState =
  | ConnectingTerminalSurfaceState
  | LiveTerminalSurfaceState
  | DisconnectedTerminalSurfaceState
  | EndedTerminalSurfaceState
  | FaultedTerminalSurfaceState;
type TerminalDimensions = Readonly<{ columns: number; rows: number }>;
type TerminalSurfaceDisposable = Readonly<{ dispose(): void }>;
type TerminalSurfaceEvent<T> = (listener: (event: T) => void) => TerminalSurfaceDisposable;

export interface TerminalSurfaceView {
  readonly onDidOpen: TerminalSurfaceEvent<TerminalDimensions | undefined>;
  readonly onDidClose: TerminalSurfaceEvent<void>;
  readonly onDidInput: TerminalSurfaceEvent<void>;
  readonly onDidChangeActive: TerminalSurfaceEvent<boolean>;
  show(): void;
  write(ansi: string): void;
  writeStatus(message: string): void;
  reset(): void;
  dispose(): void;
}

const retryDelays = [500, 1000, 2000, 5000, 10000, 30000] as const;

export class TerminalSurface {
  private readonly subscriptions: { dispose(): void }[];
  private readonly request: TerminalSurfaceRequest;
  private readonly observerFactory: HerdrTerminalObserverFactory;
  private readonly configuration: HerdrConfigurationSource;
  private readonly logger: HerdrLogger;
  private readonly view: TerminalSurfaceView;
  private readonly onDidClose: (surface: TerminalSurface) => void;
  private state: TerminalSurfaceState = { kind: "connecting" };
  private selectedInNavigation = false;
  private editorFocused = false;
  private opened = false;
  private inputNoticeShown = false;
  private awaitingFullFrame = false;
  private attemptSequence = 0;
  private activeAttemptId: number | undefined;
  private observerAttempt: HerdrTerminalObserverAttempt | undefined;
  private retrySequence = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private columns = 80;
  private rows = 24;
  private disposed = false;

  constructor(
    request: TerminalSurfaceRequest,
    projection: ActiveSessionProjectionState,
    observerFactory: HerdrTerminalObserverFactory,
    configuration: HerdrConfigurationSource,
    logger: HerdrLogger,
    view: TerminalSurfaceView,
    onDidClose: (surface: TerminalSurface) => void,
  ) {
    this.request = request;
    this.observerFactory = observerFactory;
    this.configuration = configuration;
    this.logger = logger;
    this.view = view;
    this.onDidClose = onDidClose;
    this.subscriptions = [
      view.onDidOpen((dimensions) => this.openObserver(dimensions)),
      view.onDidClose(() => this.closeByUser()),
      view.onDidInput(() => this.showReadOnlyNotice()),
      view.onDidChangeActive((active) => this.changeEditorFocus(active)),
    ];
    this.applyProjection(projection);
  }

  show(): void {
    if (this.disposed) return;
    this.view.show();
    if (this.state.kind === "faulted") {
      this.retrySequence = 0;
      this.startObserver(true);
    }
  }

  updateProjection(projection: ActiveSessionProjectionState): void {
    if (!this.disposed) this.applyProjection(projection);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelRetry();
    this.stopObserver();
    for (const subscription of this.subscriptions) subscription.dispose();
    this.view.dispose();
  }

  private openObserver(dimensions: TerminalDimensions | undefined): void {
    if (this.disposed) return;
    this.opened = true;
    this.columns = positiveDimension(dimensions?.columns, 80);
    this.rows = positiveDimension(dimensions?.rows, 24);
    if (this.state.kind === "ended") this.view.writeStatus("Pane is no longer available");
    this.startObserver();
  }

  private applyProjection(projection: ActiveSessionProjectionState): void {
    this.selectedInNavigation = projection.sessionId === this.request.sessionId;
    if (
      projection.kind === "connected" &&
      projection.sessionId === this.request.sessionId &&
      !projection.snapshot.panes.some((pane) => pane.terminalId === this.request.terminalId)
    ) {
      this.endSurface();
      return;
    }
    this.reconcileRetryEligibility();
  }

  private changeEditorFocus(active: boolean): void {
    this.editorFocused = active;
    this.reconcileRetryEligibility();
  }

  private reconcileRetryEligibility(): void {
    if (this.disposed || this.state.kind === "ended" || this.state.kind === "faulted") return;
    if (this.activeAttemptId !== undefined) return;
    if (!this.isRelevant()) {
      if (this.retryTimer !== undefined) this.cancelRetry();
      if (this.state.kind === "disconnected" && this.state.phase !== "paused") {
        this.transition({ kind: "disconnected", phase: "paused" });
      }
      return;
    }
    if (this.state.kind === "disconnected" && this.state.phase === "paused") this.startObserver();
  }

  private startObserver(retryFaulted = false): void {
    if (
      this.disposed ||
      !this.opened ||
      this.state.kind === "ended" ||
      (this.state.kind === "faulted" && !retryFaulted) ||
      this.activeAttemptId !== undefined
    ) {
      return;
    }
    this.cancelRetry();
    const attemptId = ++this.attemptSequence;
    this.activeAttemptId = attemptId;
    this.awaitingFullFrame = attemptId > 1;
    const waitingNoticeAlreadyShown = this.state.kind === "disconnected" && this.state.phase === "waiting";
    if (attemptId > 1 && !waitingNoticeAlreadyShown) this.view.writeStatus("Observer reconnecting");
    this.transition({ kind: "connecting" });
    try {
      const attempt = this.observerFactory.start(
        {
          executable: this.configuration.read().executable,
          sessionId: this.request.sessionId,
          terminalId: this.request.terminalId,
          columns: this.columns,
          rows: this.rows,
        },
        (event) => this.receiveObserverEvent(attemptId, event),
      );
      if (this.activeAttemptId !== attemptId) attempt.dispose();
      else this.observerAttempt = attempt;
    } catch (error) {
      this.receiveObserverEvent(attemptId, {
        kind: "transport-lost",
        diagnostic: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private receiveObserverEvent(attemptId: number, event: HerdrTerminalObserverEvent): void {
    if (this.disposed || this.activeAttemptId !== attemptId) return;
    switch (event.kind) {
      case "frame":
        if (this.awaitingFullFrame && !event.full) return;
        if (this.awaitingFullFrame) {
          this.view.reset();
          this.inputNoticeShown = false;
          this.awaitingFullFrame = false;
        }
        this.view.write(event.ansi);
        if (event.full) this.retrySequence = 0;
        this.transition({ kind: "live" });
        return;
      case "closed":
        this.finishAttempt(attemptId);
        this.logger.info(
          `Observer ended for Session "${this.request.sessionId}" terminal "${this.request.terminalId}"${event.reason === undefined ? "." : `: ${event.reason}`}`,
        );
        this.retryAfterLoss();
        return;
      case "transport-lost":
        this.finishAttempt(attemptId);
        this.logger.error(
          `Observer disconnected for Session "${this.request.sessionId}" terminal "${this.request.terminalId}": ${event.diagnostic}`,
        );
        this.retryAfterLoss();
        return;
      case "fault":
        this.finishAttempt(attemptId);
        this.logger.error(
          `Observer output faulted for Session "${this.request.sessionId}" terminal "${this.request.terminalId}": ${event.diagnostic}`,
        );
        this.transition({ kind: "faulted" });
        return;
    }
  }

  private retryAfterLoss(): void {
    if (!this.isRelevant()) {
      this.transition({ kind: "disconnected", phase: "paused" });
      return;
    }
    if (this.retrySequence === 0) {
      this.retrySequence = 1;
      this.startObserver();
      return;
    }
    const delayIndex = Math.min(this.retrySequence - 1, retryDelays.length - 1);
    const baseDelay = retryDelays[delayIndex] ?? 30000;
    const delay = Math.round(baseDelay * (0.8 + Math.random() * 0.4));
    this.transition({ kind: "disconnected", phase: "waiting" });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (this.disposed || !this.isRelevant()) {
        this.reconcileRetryEligibility();
        return;
      }
      this.retrySequence += 1;
      this.startObserver();
    }, delay);
  }

  private endSurface(): void {
    if (this.state.kind === "ended") return;
    this.cancelRetry();
    this.stopObserver();
    this.transition({ kind: "ended" });
  }

  private showReadOnlyNotice(): void {
    if (this.disposed || this.inputNoticeShown) return;
    this.inputNoticeShown = true;
    this.view.writeStatus("Read-only observer; input is disabled");
  }

  private closeByUser(): void {
    if (this.disposed) return;
    this.dispose();
    this.onDidClose(this);
  }

  private finishAttempt(attemptId: number): void {
    if (this.activeAttemptId !== attemptId) return;
    this.activeAttemptId = undefined;
    const attempt = this.observerAttempt;
    this.observerAttempt = undefined;
    attempt?.dispose();
  }

  private stopObserver(): void {
    this.activeAttemptId = undefined;
    const attempt = this.observerAttempt;
    this.observerAttempt = undefined;
    attempt?.dispose();
  }

  private cancelRetry(): void {
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private transition(next: TerminalSurfaceState): void {
    if (sameState(this.state, next)) return;
    this.state = next;
    if (!this.opened) return;
    if (next.kind === "disconnected") {
      this.view.writeStatus(
        next.phase === "waiting" ? "Observer disconnected; reconnecting" : "Observer disconnected; reconnect paused",
      );
    } else if (next.kind === "ended") {
      this.view.writeStatus("Pane is no longer available");
    } else if (next.kind === "faulted") {
      this.view.writeStatus("Observer stopped; invalid output");
    }
  }

  private isRelevant(): boolean {
    return this.selectedInNavigation || this.editorFocused;
  }
}

function positiveDimension(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}

function sameState(left: TerminalSurfaceState, right: TerminalSurfaceState): boolean {
  return (
    left.kind === right.kind &&
    (left.kind !== "disconnected" || right.kind !== "disconnected" || left.phase === right.phase)
  );
}
