import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveSessionProjectionSource,
  ActiveSessionProjectionState,
  HerdrPane,
  HerdrSessionSnapshot,
} from "@capabilities/sessions";
import type { HerdrLogger } from "@capabilities/runtime";
import type * as vscode from "vscode";
import type { PaneClientFactory, PaneClientRequest } from "./HerdrPaneClientFactory";
import type { PaneOutputSink } from "./PaneOutputSink";
import { PaneEditorFocusTracker } from "./PaneEditorFocusTracker";
import { PaneEditorSelectionModel, type SelectedPaneEditor } from "./PaneEditorSelectionModel";
import { VsCodePaneTerminalSurface } from "./PaneTerminalSurface";

const vscodeStub = vi.hoisted(() => {
  class MockEventEmitter<T> {
    private readonly listeners = new Set<(value: T) => void>();

    readonly event = (listener: (value: T) => void): { dispose(): void } => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };

    fire(value: T): void {
      Array.from(this.listeners).forEach((listener) => listener(value));
    }

    dispose(): void {
      this.listeners.clear();
    }
  }

  const terminals: {
    pty: vscode.Pseudoterminal;
    terminal: { show: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
  }[] = [];
  const windowListeners = new Set<(state: { focused: boolean }) => void>();
  let focused = true;
  const showWarningMessage = vi.fn(() => Promise.resolve(undefined));
  const createTerminal = (options: { pty: vscode.Pseudoterminal }) => {
    const terminal = { show: vi.fn(), dispose: vi.fn() };
    terminals.push({ pty: options.pty, terminal });
    return terminal;
  };

  return {
    EventEmitter: MockEventEmitter,
    terminals,
    window: {
      get state() {
        return { focused };
      },
      createTerminal,
      onDidChangeWindowState: (listener: (state: { focused: boolean }) => void) => {
        windowListeners.add(listener);
        return { dispose: () => windowListeners.delete(listener) };
      },
      showWarningMessage,
    },
    setWindowFocused(nextFocused: boolean): void {
      if (focused === nextFocused) return;
      focused = nextFocused;
      Array.from(windowListeners).forEach((listener) => listener({ focused }));
    },
    reset(): void {
      terminals.splice(0);
      windowListeners.clear();
      focused = true;
      showWarningMessage.mockClear();
    },
  };
});

vi.mock("vscode", () => vscodeStub);

const sessionId = "session-1";
const initialPane = pane("pane-1", "terminal-1");
const initialSelection: SelectedPaneEditor = { sessionId, paneId: initialPane.id };
const initialDimensions: vscode.TerminalDimensions = { columns: 80, rows: 24 };
const harnessCleanups: (() => void)[] = [];

interface FakePaneClient {
  readonly kind: "observe" | "attach";
  readonly request: PaneClientRequest;
  readonly sink: PaneOutputSink;
  readonly completion: Promise<void>;
  stopRequested: boolean;
  completed: boolean;
  readonly inputs: string[];
  readonly resizes: { columns: number; rows: number }[];
  stop(): Promise<void>;
  settleStop(): void;
  complete(): void;
  sendInput(data: string): void;
  resize(columns: number, rows: number): void;
}

function pane(id: string, terminalId: string, terminalTitle = `Pane ${id}`): HerdrPane {
  return {
    id,
    terminalId,
    spaceId: "space-1",
    herdrTabId: "tab-1",
    focused: false,
    agentStatus: "idle",
    revision: 1,
    terminalTitle,
    stateLabels: {},
    tokens: {},
  };
}

function snapshot(panes: readonly HerdrPane[]): HerdrSessionSnapshot {
  return {
    version: "1",
    protocol: 1,
    spaces: [],
    herdrTabs: [],
    panes,
    layouts: [],
    agents: [],
  };
}

function connected(nextSessionId: string, panes: readonly HerdrPane[]): ActiveSessionProjectionState {
  return { kind: "connected", sessionId: nextSessionId, snapshot: snapshot(panes) };
}

function stale(nextSessionId: string, panes: readonly HerdrPane[]): ActiveSessionProjectionState {
  return { kind: "stale", sessionId: nextSessionId, reason: "reconnecting", snapshot: snapshot(panes) };
}

function isRunning(client: FakePaneClient): boolean {
  return !client.stopRequested && !client.completed;
}

function isRunningOfKind(client: FakePaneClient, kind: FakePaneClient["kind"]): boolean {
  return client.kind === kind && isRunning(client);
}

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createProjectionSource(initial: ActiveSessionProjectionState): {
  source: ActiveSessionProjectionSource;
  setState(next: ActiveSessionProjectionState): void;
} {
  let state = initial;
  const listeners = new Set<(next: ActiveSessionProjectionState) => void>();
  return {
    source: {
      getActiveSessionProjection: () => state,
      onDidChangeActiveSessionProjection: (listener) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
    },
    setState: (next) => {
      state = next;
      listeners.forEach((listener) => listener(next));
    },
  };
}

function createFakeClient(kind: FakePaneClient["kind"], request: PaneClientRequest, sink: PaneOutputSink) {
  let resolveCompletion!: () => void;
  let settleStop!: () => void;
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });
  const stopPromise = new Promise<void>((resolve) => {
    settleStop = resolve;
  });
  const client: FakePaneClient = {
    kind,
    request,
    sink,
    completion,
    stopRequested: false,
    completed: false,
    inputs: [],
    resizes: [],
    stop: () => {
      client.stopRequested = true;
      return stopPromise;
    },
    settleStop: () => settleStop(),
    complete: () => {
      client.completed = true;
      resolveCompletion();
    },
    sendInput: (data) => client.inputs.push(data),
    resize: (columns, rows) => client.resizes.push({ columns, rows }),
  };
  return client;
}

function createPaneClients() {
  const observers: FakePaneClient[] = [];
  const attaches: FakePaneClient[] = [];
  const clients: FakePaneClient[] = [];
  let observerAttempts = 0;
  let attachAttempts = 0;
  let nextObserverFailure: Error | undefined;
  let nextAttachFailure: Error | undefined;

  const factory: PaneClientFactory = {
    createObserver: (request, sink) => {
      observerAttempts += 1;
      if (nextObserverFailure !== undefined) {
        const error = nextObserverFailure;
        nextObserverFailure = undefined;
        throw error;
      }
      const observer = createFakeClient("observe", request, sink);
      observers.push(observer);
      clients.push(observer);
      return observer;
    },
    createAttach: (request, sink) => {
      attachAttempts += 1;
      if (nextAttachFailure !== undefined) {
        const error = nextAttachFailure;
        nextAttachFailure = undefined;
        throw error;
      }
      const attach = createFakeClient("attach", request, sink);
      attaches.push(attach);
      clients.push(attach);
      return attach;
    },
  };

  return {
    factory,
    observers,
    attaches,
    clients,
    get observerAttempts() {
      return observerAttempts;
    },
    get attachAttempts() {
      return attachAttempts;
    },
    failNextObserver(error: Error): void {
      nextObserverFailure = error;
    },
    failNextAttach(error: Error): void {
      nextAttachFailure = error;
    },
  };
}

function createHarness(
  options: {
    initialProjection?: ActiveSessionProjectionState;
    initiallyFocused?: boolean;
  } = {},
) {
  if (options.initiallyFocused === false) vscodeStub.setWindowFocused(false);
  const selection = new PaneEditorSelectionModel();
  const focusTracker = new PaneEditorFocusTracker(selection);
  const projection = createProjectionSource(options.initialProjection ?? connected(sessionId, [initialPane]));
  const paneClients = createPaneClients();
  const logger: HerdrLogger = { info: vi.fn(), error: vi.fn(), show: vi.fn() };
  const surfaces: {
    surface: VsCodePaneTerminalSurface;
    pty: vscode.Pseudoterminal;
    terminal: { show: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
    writes: string[];
  }[] = [];

  const createSurface = (identity: SelectedPaneEditor = initialSelection) => {
    const surface = new VsCodePaneTerminalSurface(
      identity,
      1,
      `${identity.sessionId}:${identity.paneId}`,
      projection.source,
      focusTracker,
      paneClients.factory,
      { offer: () => ({ retract: () => undefined }) },
      logger,
    );
    const terminalRecord = vscodeStub.terminals.at(-1);
    assert(terminalRecord);
    const control = {
      surface,
      pty: terminalRecord.pty,
      terminal: terminalRecord.terminal,
      writes: [] as string[],
    };
    terminalRecord.pty.onDidWrite((data) => control.writes.push(data));
    surfaces.push(control);
    return control;
  };

  const running = () =>
    paneClients.clients.filter(isRunning).map(({ kind, request, resizes }) => {
      const currentDimensions = resizes.at(-1) ?? request;
      return {
        kind,
        terminalId: request.terminalId,
        columns: currentDimensions.columns,
        rows: currentDimensions.rows,
      };
    });

  const onlyRunning = (kind: FakePaneClient["kind"]): FakePaneClient => {
    const matching = paneClients.clients.filter((client) => isRunningOfKind(client, kind));
    expect(matching).toHaveLength(1);
    const [client] = matching;
    assert(client);
    return client;
  };

  const cleanup = () => {
    surfaces.forEach(({ surface }) => surface.dispose());
    focusTracker.dispose();
    selection.dispose();
    paneClients.clients.forEach((client) => {
      client.complete();
      client.settleStop();
    });
  };
  harnessCleanups.push(cleanup);

  return { selection, projection, paneClients, running, onlyRunning, createSurface };
}

function expectPlaceholderHeading(writes: readonly string[], heading: string): void {
  expect(writes.at(-1)).toContain(heading);
}

beforeEach(() => {
  vscodeStub.reset();
});

afterEach(async () => {
  harnessCleanups.forEach((cleanup) => cleanup());
  harnessCleanups.splice(0);
  vi.useRealTimers();
  await nextMacrotask();
});

describe("VsCodePaneTerminalSurface client modes (C1)", () => {
  it("waits for dimensions, attaches while selected and focused, and observes after blur", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();

    harness.selection.select(initialSelection);
    await nextMacrotask();
    expect(harness.running()).toEqual([]);
    surface.pty.open(undefined);
    await nextMacrotask();
    expect(harness.running()).toEqual([]);
    surface.pty.setDimensions?.(initialDimensions);
    expect(harness.running()).toEqual([{ kind: "attach", terminalId: initialPane.terminalId, ...initialDimensions }]);
    expect(harness.onlyRunning("attach").request).toEqual({
      sessionId,
      terminalId: initialPane.terminalId,
      columns: initialDimensions.columns,
      rows: initialDimensions.rows,
    });

    vscodeStub.setWindowFocused(false);
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([
        { kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions },
      ]),
    );

    harness.selection.deselect(initialSelection);
    await nextMacrotask();
    expect(harness.running()).toEqual([]);
  });

  it("keeps selected Pane Surfaces independent and resizes a direct attach in place", () => {
    const harness = createHarness();
    const firstSurface = harness.createSurface(initialSelection);
    const secondPane = pane("pane-2", "terminal-2");
    const secondSelection = { sessionId, paneId: secondPane.id };
    harness.projection.setState(connected(sessionId, [initialPane, secondPane]));
    const secondSurface = harness.createSurface(secondSelection);

    firstSurface.pty.open(initialDimensions);
    secondSurface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    harness.selection.select(secondSelection);

    expect(harness.running()).toEqual([
      { kind: "attach", terminalId: initialPane.terminalId, ...initialDimensions },
      { kind: "attach", terminalId: secondPane.terminalId, ...initialDimensions },
    ]);
    firstSurface.pty.setDimensions?.({ columns: 100, rows: 32 });
    const firstAttach = harness.paneClients.attaches.find(
      ({ request }) => request.terminalId === initialPane.terminalId,
    );
    expect(firstAttach?.resizes).toEqual([{ columns: 100, rows: 32 }]);
    expect(harness.running()).toEqual([
      { kind: "attach", terminalId: initialPane.terminalId, columns: 100, rows: 32 },
      { kind: "attach", terminalId: secondPane.terminalId, ...initialDimensions },
    ]);
    expect(harness.paneClients.attaches).toHaveLength(2);
  });
});

describe("VsCodePaneTerminalSurface attach handoff (C2)", () => {
  it("waits for a released direct attach to stop before starting another", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const firstAttach = harness.onlyRunning("attach");

    vscodeStub.setWindowFocused(false);
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([
        { kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions },
      ]),
    );
    vscodeStub.setWindowFocused(true);
    await nextMacrotask();
    expect(harness.running()).toEqual([]);
    expect(harness.paneClients.attaches).toHaveLength(1);

    firstAttach.settleStop();
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([{ kind: "attach", terminalId: initialPane.terminalId, ...initialDimensions }]),
    );
    expect(harness.paneClients.attaches).toHaveLength(2);
  });
});

describe("VsCodePaneTerminalSurface displacement recovery (C3)", () => {
  it("does not fight back after displacement and reattaches on local intent", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const initialAttach = harness.onlyRunning("attach");

    initialAttach.complete();
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([
        { kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions },
      ]),
    );
    await nextMacrotask();
    expect(harness.paneClients.attaches).toHaveLength(1);

    surface.pty.handleInput?.("local input");
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([{ kind: "attach", terminalId: initialPane.terminalId, ...initialDimensions }]),
    );
    expect(harness.onlyRunning("attach").inputs).toEqual(["local input"]);

    harness.onlyRunning("attach").complete();
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([
        { kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions },
      ]),
    );

    vscodeStub.setWindowFocused(false);
    vscodeStub.setWindowFocused(true);
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([{ kind: "attach", terminalId: initialPane.terminalId, ...initialDimensions }]),
    );
    expect(harness.paneClients.attaches).toHaveLength(3);
  });
});

describe("VsCodePaneTerminalSurface attach creation failure (C4)", () => {
  it("warns once for failed input takeover and retries only after a new focus transition", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    harness.onlyRunning("attach").complete();
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([
        { kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions },
      ]),
    );
    harness.paneClients.failNextAttach(new Error("attach could not start"));
    surface.pty.handleInput?.("first input");

    expect(harness.paneClients.attachAttempts).toBe(2);
    expect(harness.running()).toEqual([{ kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions }]);
    expect(vscodeStub.window.showWarningMessage).toHaveBeenCalledTimes(1);

    surface.pty.handleInput?.("second input");
    await nextMacrotask();
    expect(harness.paneClients.attachAttempts).toBe(2);
    expect(vscodeStub.window.showWarningMessage).toHaveBeenCalledTimes(1);

    vscodeStub.setWindowFocused(false);
    vscodeStub.setWindowFocused(true);
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([{ kind: "attach", terminalId: initialPane.terminalId, ...initialDimensions }]),
    );
    expect(harness.paneClients.attachAttempts).toBe(3);
    expect(vscodeStub.window.showWarningMessage).toHaveBeenCalledTimes(1);
  });
});

describe("VsCodePaneTerminalSurface input translation (C5)", () => {
  it("translates key markers, DECCKM arrows, wheel arrows, and ordinary input", () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const attach = harness.onlyRunning("attach");

    const arrowUpMarker = "\x1b]herdr;arrow-up\x07";
    const arrowDownMarker = "\x1b]herdr;arrow-down\x07";
    surface.pty.handleInput?.(arrowUpMarker);
    surface.pty.handleInput?.(arrowDownMarker);
    expect(attach.inputs).toEqual(["\x1b[A", "\x1b[B"]);

    attach.sink.append("\x1b[?1h");
    surface.pty.handleInput?.(arrowUpMarker);
    surface.pty.handleInput?.(arrowDownMarker);
    expect(attach.inputs.slice(2)).toEqual(["\x1bOA", "\x1bOB"]);

    attach.sink.append("\x1b[?1l");
    surface.pty.handleInput?.("\x1b[A\x1bOB\x1b[B");
    surface.pty.handleInput?.("ordinary input\r");
    expect(attach.inputs.slice(4)).toEqual(["\x1b[<64;1;1M\x1b[<65;1;1M\x1b[<65;1;1M", "ordinary input\r"]);
  });
});

describe("VsCodePaneTerminalSurface projection routing (C6)", () => {
  it("suspends non-active and stale Pane projections, then clears the placeholder on live output", async () => {
    const harness = createHarness({
      initialProjection: connected("session-other", [pane(initialPane.id, "remote-terminal")]),
    });
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    expectPlaceholderHeading(surface.writes, "Herdr Pane is not connected");
    await nextMacrotask();
    expect(harness.running()).toEqual([]);

    harness.projection.setState(stale(sessionId, [initialPane]));
    expectPlaceholderHeading(surface.writes, "Herdr Pane is reconnecting");
    harness.projection.setState(connected(sessionId, []));
    expectPlaceholderHeading(surface.writes, "Herdr Pane is unavailable");
    await nextMacrotask();
    expect(harness.running()).toEqual([]);

    harness.projection.setState(connected(sessionId, [initialPane]));
    const attach = harness.onlyRunning("attach");
    attach.sink.append("live Pane output");
    expect(surface.writes.at(-1)).toBe("live Pane output");
  });

  it("routes a changed terminal ID and keeps its direct attach when the Pane moves", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const oldAttach = harness.onlyRunning("attach");

    const currentPane = pane(initialPane.id, "terminal-current");
    harness.projection.setState(connected(sessionId, [currentPane]));
    expect(harness.running()).toEqual([]);
    await nextMacrotask();
    expect(harness.paneClients.attaches).toHaveLength(1);
    oldAttach.settleStop();
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([{ kind: "attach", terminalId: "terminal-current", ...initialDimensions }]),
    );

    const currentAttach = harness.onlyRunning("attach");
    const movedPane = pane("pane-moved", "terminal-current", "Moved Pane");
    const movedSelection = { sessionId, paneId: movedPane.id };
    harness.selection.move(initialSelection, movedSelection);
    surface.surface.move(movedPane);
    await nextMacrotask();

    expect(harness.running()).toEqual([{ kind: "attach", terminalId: "terminal-current", ...initialDimensions }]);
    expect(currentAttach.stopRequested).toBe(false);
    expect(harness.paneClients.attaches).toHaveLength(2);
  });
});

describe("VsCodePaneTerminalSurface observer resize (O1)", () => {
  it("debounces observer restarts and uses the latest dimensions", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ initiallyFocused: false });
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    expect(harness.running()).toEqual([{ kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions }]);

    surface.pty.setDimensions?.({ columns: 90, rows: 30 });
    await vi.advanceTimersByTimeAsync(60);
    surface.pty.setDimensions?.({ columns: 110, rows: 40 });
    await vi.advanceTimersByTimeAsync(119);
    expect(harness.paneClients.observers).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(harness.running()).toEqual([
      { kind: "observe", terminalId: initialPane.terminalId, columns: 110, rows: 40 },
    ]);
    expect(harness.paneClients.observers).toHaveLength(2);
  });
});

describe("VsCodePaneTerminalSurface observer failure (O2)", () => {
  it("does not retry on a timer after observer creation throws", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ initiallyFocused: false });
    harness.paneClients.failNextObserver(new Error("observer could not start"));
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);

    expectPlaceholderHeading(surface.writes, "Herdr Pane observer failed");
    expect(harness.paneClients.observerAttempts).toBe(1);
    expect(harness.running()).toEqual([]);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.paneClients.observerAttempts).toBe(1);

    surface.pty.setDimensions?.({ columns: 100, rows: 36 });
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.paneClients.observerAttempts).toBe(2);
    expect(harness.running()).toEqual([
      { kind: "observe", terminalId: initialPane.terminalId, columns: 100, rows: 36 },
    ]);
  });

  it("does not retry on a timer after observer completion resolves", async () => {
    vi.useFakeTimers();
    const harness = createHarness({ initiallyFocused: false });
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    harness.onlyRunning("observe").complete();
    await vi.advanceTimersByTimeAsync(0);

    expectPlaceholderHeading(surface.writes, "Herdr Pane observer failed");
    expect(harness.paneClients.observerAttempts).toBe(1);
    expect(harness.running()).toEqual([]);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(harness.paneClients.observerAttempts).toBe(1);

    surface.pty.setDimensions?.({ columns: 100, rows: 36 });
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.paneClients.observerAttempts).toBe(2);
    expect(harness.running()).toEqual([
      { kind: "observe", terminalId: initialPane.terminalId, columns: 100, rows: 36 },
    ]);
  });
});

describe("VsCodePaneTerminalSurface disposal (O5)", () => {
  it("stops the direct attach and terminal, and ignores stop and completion after disposal", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const attach = harness.onlyRunning("attach");

    surface.surface.dispose();
    expect(attach.stopRequested).toBe(true);
    expect(surface.terminal.dispose).toHaveBeenCalledTimes(1);
    expect(harness.running()).toEqual([]);
    attach.settleStop();
    attach.complete();
    await nextMacrotask();

    expect(harness.running()).toEqual([]);
    expect(harness.paneClients.attaches).toHaveLength(1);
    expect(harness.paneClients.observers).toHaveLength(0);
  });
});
