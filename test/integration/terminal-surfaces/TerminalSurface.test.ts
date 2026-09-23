import { describe, expect, it, vi } from "vitest";
import type { HerdrLogger } from "../../../src/capabilities/runtime";
import type {
  ActiveSessionProjectionState,
  HerdrConfigurationSource,
  HerdrPane,
  HerdrSessionSnapshot,
} from "../../../src/capabilities/sessions";
import type {
  HerdrTerminalObserverEvent,
  HerdrTerminalObserverFactory,
  HerdrTerminalObserverRequest,
} from "../../../src/capabilities/terminalSurfaces";
import { TerminalSurface, type TerminalSurfaceView } from "../../../src/features/terminal-surfaces/TerminalSurface";

type Listener<T> = (event: T) => void;

type Disposable = Readonly<{ dispose(): void }>;

class TestEvent<T> {
  private readonly listeners = new Set<Listener<T>>();

  readonly event = (listener: Listener<T>): Disposable => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  fire(event: T): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

type ViewOperation =
  | Readonly<{ kind: "write"; value: string }>
  | Readonly<{ kind: "status"; value: string }>
  | Readonly<{ kind: "reset" }>;

class ControlledView implements TerminalSurfaceView {
  private readonly opened = new TestEvent<Readonly<{ columns: number; rows: number }> | undefined>();
  private readonly closed = new TestEvent<void>();
  private readonly input = new TestEvent<void>();
  private readonly active = new TestEvent<boolean>();
  readonly onDidOpen = this.opened.event;
  readonly onDidClose = this.closed.event;
  readonly onDidInput = this.input.event;
  readonly onDidChangeActive = this.active.event;
  readonly operations: ViewOperation[] = [];
  showCount = 0;
  disposeCount = 0;

  show(): void {
    this.showCount += 1;
  }

  write(ansi: string): void {
    this.operations.push({ kind: "write", value: ansi });
  }

  writeStatus(message: string): void {
    this.operations.push({ kind: "status", value: message });
  }

  reset(): void {
    this.operations.push({ kind: "reset" });
  }

  dispose(): void {
    this.disposeCount += 1;
  }

  open(dimensions?: Readonly<{ columns: number; rows: number }>): void {
    this.opened.fire(dimensions);
  }

  close(): void {
    this.closed.fire();
  }

  sendInput(): void {
    this.input.fire();
  }

  setActive(active: boolean): void {
    this.active.fire(active);
  }
}

interface ControlledAttempt {
  readonly request: HerdrTerminalObserverRequest;
  disposeCount: number;
  emit(event: HerdrTerminalObserverEvent): void;
  dispose(): void;
}

class ControlledObserverFactory implements HerdrTerminalObserverFactory {
  readonly attempts: ControlledAttempt[] = [];

  start(
    request: HerdrTerminalObserverRequest,
    listener: (event: HerdrTerminalObserverEvent) => void,
  ): ControlledAttempt {
    const attempt: ControlledAttempt = {
      request,
      disposeCount: 0,
      emit: (event) => listener(event),
      dispose: () => {
        attempt.disposeCount += 1;
      },
    };
    this.attempts.push(attempt);
    return attempt;
  }
}

const logger: HerdrLogger = { info: () => undefined, error: () => undefined, show: () => undefined };
const configuration: HerdrConfigurationSource = {
  read: () => ({ executable: "controlled-observer", session: "default" }),
  onDidChange: () => ({ dispose: () => undefined }),
};
const request = { sessionId: "session-a", paneId: "pane-a", terminalId: "terminal-a", name: "Pane A" } as const;

function snapshot(terminalIds: readonly string[]): HerdrSessionSnapshot {
  const panes: HerdrPane[] = terminalIds.map((terminalId, index) => ({
    id: `pane-${index}`,
    terminalId,
    spaceId: "space-a",
    herdrTabId: "tab-a",
    focused: index === 0,
    agentStatus: "idle",
    revision: index,
    stateLabels: {},
    tokens: {},
  }));
  return { version: "1", protocol: 1, spaces: [], herdrTabs: [], panes, layouts: [], agents: [] };
}

function projection(
  sessionId: string,
  terminalIds: readonly string[],
  kind: "connected" | "stale" = "connected",
): ActiveSessionProjectionState {
  return kind === "connected"
    ? { kind, sessionId, snapshot: snapshot(terminalIds) }
    : { kind, sessionId, reason: "reconnecting", snapshot: snapshot(terminalIds) };
}

function surfaceHarness(initial: ActiveSessionProjectionState = projection(request.sessionId, [request.terminalId])) {
  const view = new ControlledView();
  const observerFactory = new ControlledObserverFactory();
  const closedSurfaces: TerminalSurface[] = [];
  const surface = new TerminalSurface(request, initial, observerFactory, configuration, logger, view, (closed) =>
    closedSurfaces.push(closed),
  );
  return { view, observerFactory, surface, closedSurfaces };
}

function lost(attempt: ControlledAttempt): void {
  attempt.emit({ kind: "transport-lost", diagnostic: "controlled stream ended" });
}

describe("read-only terminal surface lifecycle", () => {
  it("opens an observer with current dimensions and emits input indication without forwarding input", () => {
    const { view, observerFactory, surface } = surfaceHarness();
    view.open({ columns: 132, rows: 41 });

    expect(observerFactory.attempts).toHaveLength(1);
    expect(observerFactory.attempts[0]?.request).toEqual({
      executable: "controlled-observer",
      sessionId: "session-a",
      terminalId: "terminal-a",
      columns: 132,
      rows: 41,
    });

    view.sendInput();
    view.sendInput();
    expect(view.operations.filter((operation) => operation.kind === "status")).toEqual([
      { kind: "status", value: "Read-only observer; input is disabled" },
    ]);
    expect(observerFactory.attempts).toHaveLength(1);
    surface.dispose();
  });

  it("retries immediately after loss, then uses a bounded cadence capped at 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      const { view, observerFactory, surface } = surfaceHarness();
      view.open();
      const first = observerFactory.attempts[0];
      expect(first).toBeDefined();
      if (first === undefined) throw new Error("initial observer attempt was not created");
      lost(first);
      expect(observerFactory.attempts).toHaveLength(2);

      for (const latestDelayUpperBound of [601, 1201, 2401, 6001, 12001, 36001]) {
        const current = observerFactory.attempts.at(-1);
        expect(current).toBeDefined();
        if (current === undefined) throw new Error("expected a retry observer attempt");
        lost(current);
        const countBeforeTimer = observerFactory.attempts.length;
        await vi.advanceTimersByTimeAsync(latestDelayUpperBound);
        expect(observerFactory.attempts).toHaveLength(countBeforeTimer + 1);
      }

      const cappedAttempt = observerFactory.attempts.at(-1);
      expect(cappedAttempt).toBeDefined();
      if (cappedAttempt === undefined) throw new Error("expected observer attempt at the capped cadence");
      lost(cappedAttempt);
      const countBeforeCap = observerFactory.attempts.length;
      await vi.advanceTimersByTimeAsync(23_999);
      expect(observerFactory.attempts).toHaveLength(countBeforeCap);
      await vi.advanceTimersByTimeAsync(12_001);
      expect(observerFactory.attempts).toHaveLength(countBeforeCap + 1);
      surface.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses a lost observer while its other Session is inactive and resumes on navigation return", async () => {
    vi.useFakeTimers();
    try {
      const { view, observerFactory, surface } = surfaceHarness();
      view.open();
      view.setActive(false);
      surface.updateProjection(projection("session-b", ["terminal-b"]));
      const initial = observerFactory.attempts[0];
      expect(initial).toBeDefined();
      if (initial === undefined) throw new Error("initial observer attempt was not created");
      expect(initial.disposeCount).toBe(0);

      lost(initial);
      expect(observerFactory.attempts).toHaveLength(1);
      expect(view.operations).toContainEqual({ kind: "status", value: "Observer disconnected; reconnect paused" });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(observerFactory.attempts).toHaveLength(1);

      surface.updateProjection(projection(request.sessionId, [request.terminalId]));
      expect(observerFactory.attempts).toHaveLength(2);
      expect(observerFactory.attempts[1]?.request.terminalId).toBe(request.terminalId);
      surface.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a live observer when navigation changes Session and ends only on fresh target absence", () => {
    const { view, observerFactory, surface } = surfaceHarness();
    view.open();
    const attempt = observerFactory.attempts[0];
    expect(attempt).toBeDefined();
    if (attempt === undefined) throw new Error("initial observer attempt was not created");

    surface.updateProjection(projection("session-b", ["terminal-b"]));
    expect(attempt.disposeCount).toBe(0);
    surface.updateProjection(projection(request.sessionId, [], "stale"));
    expect(attempt.disposeCount).toBe(0);
    expect(observerFactory.attempts).toHaveLength(1);

    surface.updateProjection(projection(request.sessionId, []));
    expect(attempt.disposeCount).toBe(1);
    expect(view.operations).toContainEqual({ kind: "status", value: "Pane is no longer available" });
    surface.updateProjection(projection(request.sessionId, ["replacement-terminal"]));
    expect(observerFactory.attempts).toHaveLength(1);
    surface.dispose();
  });

  it("waits for a full reconnect frame and resets the display before writing it", () => {
    const { view, observerFactory, surface } = surfaceHarness();
    view.open();
    const initial = observerFactory.attempts[0];
    expect(initial).toBeDefined();
    if (initial === undefined) throw new Error("initial observer attempt was not created");
    initial.emit({ kind: "frame", ansi: "first full frame", full: true });
    lost(initial);

    const reconnect = observerFactory.attempts[1];
    expect(reconnect).toBeDefined();
    if (reconnect === undefined) throw new Error("reconnect observer attempt was not created");
    const operationsBeforePartial = view.operations.length;
    reconnect.emit({ kind: "frame", ansi: "partial delta", full: false });
    expect(view.operations).toHaveLength(operationsBeforePartial);

    reconnect.emit({ kind: "frame", ansi: "fresh full frame", full: true });
    expect(view.operations.slice(-2)).toEqual([{ kind: "reset" }, { kind: "write", value: "fresh full frame" }]);
    surface.dispose();
  });

  it("does not auto-loop after invalid output, but an explicit reopen may retry", async () => {
    vi.useFakeTimers();
    try {
      const { view, observerFactory, surface } = surfaceHarness();
      view.open();
      const initial = observerFactory.attempts[0];
      expect(initial).toBeDefined();
      if (initial === undefined) throw new Error("initial observer attempt was not created");
      initial.emit({ kind: "fault", diagnostic: "invalid frame" });
      expect(initial.disposeCount).toBe(1);
      expect(view.operations).toContainEqual({ kind: "status", value: "Observer stopped; invalid output" });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(observerFactory.attempts).toHaveLength(1);

      surface.show();
      expect(observerFactory.attempts).toHaveLength(2);
      expect(view.showCount).toBe(1);
      surface.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a pending retry when the editor closes and disposes only observer resources", async () => {
    vi.useFakeTimers();
    try {
      const { view, observerFactory, surface, closedSurfaces } = surfaceHarness();
      view.open();
      const first = observerFactory.attempts[0];
      expect(first).toBeDefined();
      if (first === undefined) throw new Error("initial observer attempt was not created");
      lost(first);
      const second = observerFactory.attempts[1];
      expect(second).toBeDefined();
      if (second === undefined) throw new Error("immediate retry was not created");
      lost(second);

      view.close();
      expect(closedSurfaces).toEqual([surface]);
      expect(second.disposeCount).toBe(1);
      expect(view.disposeCount).toBe(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(observerFactory.attempts).toHaveLength(2);
      surface.dispose();
      expect(second.disposeCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("extension disposal stops the observer without invoking a Herdr lifecycle operation", () => {
    const { view, observerFactory, surface } = surfaceHarness();
    view.open();
    const attempt = observerFactory.attempts[0];
    expect(attempt).toBeDefined();
    if (attempt === undefined) throw new Error("initial observer attempt was not created");

    surface.dispose();
    expect(attempt.disposeCount).toBe(1);
    expect(view.disposeCount).toBe(1);
    expect(observerFactory.attempts).toHaveLength(1);
  });
});
