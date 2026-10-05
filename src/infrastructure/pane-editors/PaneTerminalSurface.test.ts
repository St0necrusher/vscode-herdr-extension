import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";
import { Terminal } from "@xterm/headless";
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
import type { TakeoverOffers } from "./takeover";

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

function snapshot(panes: readonly HerdrPane[], focusedPaneId = panes[0]?.id): HerdrSessionSnapshot {
  return {
    version: "1",
    protocol: 1,
    spaces: [],
    herdrTabs: [],
    panes,
    layouts: [],
    agents: [],
    ...(focusedPaneId === undefined ? {} : { focusedPaneId }),
  };
}

function connected(
  nextSessionId: string,
  panes: readonly HerdrPane[],
  focusedPaneId = panes[0]?.id,
): ActiveSessionProjectionState {
  return { kind: "connected", sessionId: nextSessionId, snapshot: snapshot(panes, focusedPaneId) };
}

function stale(
  nextSessionId: string,
  panes: readonly HerdrPane[],
  focusedPaneId = panes[0]?.id,
): ActiveSessionProjectionState {
  return { kind: "stale", sessionId: nextSessionId, reason: "reconnecting", snapshot: snapshot(panes, focusedPaneId) };
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

interface RecordedTakeoverOffer {
  readonly sessionId: string;
  readonly paneId: string;
  readonly onConfirm: () => void;
  retractCount: number;
}

function createTakeoverOffers() {
  const offers: RecordedTakeoverOffer[] = [];
  const capability: TakeoverOffers = {
    offer: (request) => {
      const recordedOffer: RecordedTakeoverOffer = { ...request, retractCount: 0 };
      offers.push(recordedOffer);
      return {
        retract: () => {
          recordedOffer.retractCount += 1;
        },
      };
    },
  };
  return { capability, offers };
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
  const takeoverOffers = createTakeoverOffers();
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
      takeoverOffers.capability,
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

  return { selection, projection, paneClients, takeoverOffers, running, onlyRunning, createSurface };
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

// herdr's attach client enters the alternate screen and enables these modes; a kitty-aware app (Pi) pushes its flags on top.
const ATTACH_START = "\x1b[?1049h\x1b[?2004h\x1b[?1004h\x1b[?1000h\x1b[?1006h";
const PI_PUSHES_KITTY_FLAGS = "\x1b[>7u";
const PI_POPS_KITTY_FLAGS = "\x1b[<1u";

// Replays the Surface output into the xterm.js version VS Code 1.138 ships.
async function renderInXterm(writes: readonly string[]) {
  const terminal = new Terminal({ allowProposedApi: true, vtExtensions: { kittyKeyboard: true } });
  const write = (data: string) => new Promise<void>((resolve) => terminal.write(data, resolve));
  const replies: string[] = [];
  terminal.onData((data) => replies.push(data));
  await write(writes.join(""));
  const modes = terminal.modes;
  const kittyFlags = async () => {
    replies.splice(0);
    await write("\x1b[?u");
    return replies.join("");
  };
  // After popping one entry, the flags stay 0 only if that screen's stack was empty.
  const kittyFlagsAfterPop = async () => {
    await write(PI_POPS_KITTY_FLAGS);
    return kittyFlags();
  };
  return { write, modes, kittyFlags, kittyFlagsAfterPop };
}

// No flags on the current screen, and popping one more entry finds none left either.
async function expectNoKittyFlags(xterm: Awaited<ReturnType<typeof renderInXterm>>) {
  expect(await xterm.kittyFlags()).toBe("\x1b[?0u");
  expect(await xterm.kittyFlagsAfterPop()).toBe("\x1b[?0u");
}

describe("VsCodePaneTerminalSurface attach mode reset (#60)", () => {
  async function refocusAfterRelease(harness: ReturnType<typeof createHarness>, released: FakePaneClient) {
    released.settleStop();
    await vi.waitFor(() => expect(harness.paneClients.attaches.filter(isRunning)).toHaveLength(1));
    return harness.onlyRunning("attach");
  }

  it("leaves no kitty flags after blur → refocus → Pi exits, however often it repeats", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    let attach = harness.onlyRunning("attach");

    for (let round = 0; round < 3; round += 1) {
      attach.sink.append(`${ATTACH_START}${PI_PUSHES_KITTY_FLAGS}`);
      vscodeStub.setWindowFocused(false);
      await vi.waitFor(() => expect(harness.paneClients.observers.filter(isRunning)).toHaveLength(1));
      harness.onlyRunning("observe").sink.replace("observer full frame");
      vscodeStub.setWindowFocused(true);
      attach = await refocusAfterRelease(harness, attach);
    }
    attach.sink.append(`${ATTACH_START}${PI_PUSHES_KITTY_FLAGS}${PI_POPS_KITTY_FLAGS}`);

    const xterm = await renderInXterm(surface.writes);
    await expectNoKittyFlags(xterm);
    await xterm.write("\x1b[?1049l");
    await expectNoKittyFlags(xterm);
  });

  it("leaves no kitty flags on either screen after focused → hidden → focused, then Pi exits", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const firstAttach = harness.onlyRunning("attach");
    firstAttach.sink.append(`${ATTACH_START}${PI_PUSHES_KITTY_FLAGS}`);

    harness.selection.deselect(initialSelection);
    await nextMacrotask();
    expect(harness.running()).toEqual([]);
    harness.selection.select(initialSelection);
    const secondAttach = await refocusAfterRelease(harness, firstAttach);
    secondAttach.sink.append(`${ATTACH_START}${PI_PUSHES_KITTY_FLAGS}${PI_POPS_KITTY_FLAGS}\x1b[?1049l`);

    const xterm = await renderInXterm(surface.writes);
    await expectNoKittyFlags(xterm);
    await xterm.write("\x1b[?1049h");
    await expectNoKittyFlags(xterm);
  });

  it("leaves no kitty flags on either screen after moving to another Pane, then Pi exits", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const firstAttach = harness.onlyRunning("attach");
    firstAttach.sink.append(`${ATTACH_START}${PI_PUSHES_KITTY_FLAGS}`);

    const otherPane = pane("pane-2", "terminal-2");
    harness.selection.move(initialSelection, { sessionId, paneId: otherPane.id });
    surface.surface.move(otherPane);
    const secondAttach = await refocusAfterRelease(harness, firstAttach);
    expect(secondAttach.request.terminalId).toBe(otherPane.terminalId);
    secondAttach.sink.append(`${ATTACH_START}${PI_PUSHES_KITTY_FLAGS}${PI_POPS_KITTY_FLAGS}\x1b[?1049l`);

    const xterm = await renderInXterm(surface.writes);
    await expectNoKittyFlags(xterm);
    await xterm.write("\x1b[?1049h");
    await expectNoKittyFlags(xterm);
  });

  it("turns off bracketed paste and focus reporting when the Attach is dropped", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    harness.onlyRunning("attach").sink.append(ATTACH_START);

    harness.selection.deselect(initialSelection);

    const { modes } = await renderInXterm(surface.writes);
    expect(modes.bracketedPasteMode).toBe(false);
    expect(modes.sendFocusMode).toBe(false);
    expect(modes.mouseTrackingMode).toBe("none");
  });

  it("writes the reset when the Attach completes on its own", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const attach = harness.onlyRunning("attach");
    attach.sink.append(`${ATTACH_START}${PI_PUSHES_KITTY_FLAGS}`);

    attach.complete();
    await vi.waitFor(() => expect(harness.paneClients.observers.filter(isRunning)).toHaveLength(1));

    const xterm = await renderInXterm(surface.writes);
    await expectNoKittyFlags(xterm);
    expect(xterm.modes.bracketedPasteMode).toBe(false);
  });

  it("keeps displaced-observer mouse modes on after yielding the Attach", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    harness.onlyRunning("attach").sink.append(ATTACH_START);
    const offer = harness.takeoverOffers.offers[0];
    assert(offer);

    offer.onConfirm();

    const { modes } = await renderInXterm(surface.writes);
    expect(modes.mouseTrackingMode).toBe("vt200");
    expect(modes.bracketedPasteMode).toBe(false);
  });
});

describe("VsCodePaneTerminalSurface mobile takeover (A1–A4)", () => {
  it("A1 offers once only while attached, focused, selected, live, and Herdr-focused", () => {
    const otherPane = pane("pane-2", "terminal-2");
    const harness = createHarness({
      initialProjection: connected(sessionId, [initialPane, otherPane], initialPane.id),
      initiallyFocused: false,
    });
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);

    expect(harness.running()).toEqual([{ kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions }]);
    expect(harness.takeoverOffers.offers).toHaveLength(0);

    harness.projection.setState(connected(sessionId, [initialPane, otherPane], otherPane.id));
    vscodeStub.setWindowFocused(true);
    expect(harness.running()).toEqual([{ kind: "attach", terminalId: initialPane.terminalId, ...initialDimensions }]);
    expect(harness.takeoverOffers.offers).toHaveLength(0);

    harness.projection.setState(connected(sessionId, [initialPane, otherPane], initialPane.id));
    expect(harness.takeoverOffers.offers).toHaveLength(1);
    expect(harness.takeoverOffers.offers[0]).toMatchObject({ sessionId, paneId: initialPane.id });

    surface.pty.setDimensions?.({ columns: 90, rows: 30 });
    harness.projection.setState(connected(sessionId, [initialPane, otherPane], initialPane.id));
    expect(harness.takeoverOffers.offers).toHaveLength(1);
  });

  it("A2 retracts on window blur and selecting another editor, then offers again when focus returns", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const firstOffer = harness.takeoverOffers.offers[0];
    assert(firstOffer);
    const firstAttach = harness.onlyRunning("attach");

    vscodeStub.setWindowFocused(false);
    expect(firstOffer.retractCount).toBe(1);

    vscodeStub.setWindowFocused(true);
    firstAttach.settleStop();
    await vi.waitFor(() => expect(harness.takeoverOffers.offers).toHaveLength(2));
    const secondOffer = harness.takeoverOffers.offers[1];
    assert(secondOffer);
    const secondAttach = harness.onlyRunning("attach");
    const otherSelection = { sessionId, paneId: "pane-2" };

    harness.selection.select(otherSelection);
    harness.selection.deselect(initialSelection);
    expect(secondOffer.retractCount).toBe(1);

    harness.selection.deselect(otherSelection);
    harness.selection.select(initialSelection);
    secondAttach.settleStop();
    await vi.waitFor(() => expect(harness.takeoverOffers.offers).toHaveLength(3));
  });

  it("A2 retracts when Herdr focuses another Pane or the projection becomes stale", async () => {
    const otherPane = pane("pane-2", "terminal-2");
    const panes = [initialPane, otherPane];
    const harness = createHarness({ initialProjection: connected(sessionId, panes, initialPane.id) });
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const firstOffer = harness.takeoverOffers.offers[0];
    assert(firstOffer);

    harness.projection.setState(connected(sessionId, panes, otherPane.id));
    expect(firstOffer.retractCount).toBe(1);

    harness.projection.setState(connected(sessionId, panes, initialPane.id));
    expect(harness.takeoverOffers.offers).toHaveLength(2);
    const secondOffer = harness.takeoverOffers.offers[1];
    assert(secondOffer);
    const attach = harness.onlyRunning("attach");

    harness.projection.setState(stale(sessionId, panes, initialPane.id));
    expect(secondOffer.retractCount).toBe(1);

    harness.projection.setState(connected(sessionId, panes, initialPane.id));
    attach.settleStop();
    await vi.waitFor(() => expect(harness.takeoverOffers.offers).toHaveLength(3));
  });

  it("A2 retracts on attach displacement and disposal, then offers for a new attach", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const firstOffer = harness.takeoverOffers.offers[0];
    assert(firstOffer);

    harness.onlyRunning("attach").complete();
    await vi.waitFor(() => {
      expect(firstOffer.retractCount).toBe(1);
      expect(harness.running()).toEqual([
        { kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions },
      ]);
    });

    surface.pty.handleInput?.("local input");
    expect(harness.takeoverOffers.offers).toHaveLength(2);
    const secondOffer = harness.takeoverOffers.offers[1];
    assert(secondOffer);

    surface.surface.dispose();
    expect(secondOffer.retractCount).toBe(1);
  });

  it("A3 yields to an observer, preserves mouse modes across screen resets, and reacquires only on local intent", async () => {
    const harness = createHarness();
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const firstOffer = harness.takeoverOffers.offers[0];
    assert(firstOffer);
    const firstAttach = harness.onlyRunning("attach");

    firstOffer.onConfirm();
    expect(firstAttach.stopRequested).toBe(true);
    expect(harness.running()).toEqual([{ kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions }]);
    expect(firstOffer.retractCount).toBe(1);
    expect(harness.paneClients.attaches).toHaveLength(1);
    expect(surface.writes.at(-1)).toBe("\x1b[?1000h\x1b[?1006h");

    firstAttach.settleStop();
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([
        { kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions },
      ]),
    );
    const displacedObserver = harness.onlyRunning("observe");
    displacedObserver.sink.replace("observer full frame");
    expect(surface.writes.at(-2)).toContain("observer full frame");
    expect(surface.writes.at(-1)).toBe("\x1b[?1000h\x1b[?1006h");

    ["\x1b[<64;1;1M", "\x1b[<0;5;5m", "\x1b[I", "\x1b[O", "\x1b[A", "\x1bOB"].forEach((input) =>
      surface.pty.handleInput?.(input),
    );
    expect(harness.paneClients.attaches).toHaveLength(1);
    expect(harness.running()).toEqual([{ kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions }]);

    surface.pty.handleInput?.("\x1b[<0;5;5M");
    expect(harness.paneClients.attaches).toHaveLength(2);
    const mouseAttach = harness.onlyRunning("attach");
    expect(mouseAttach.inputs).toEqual([]);
    expect(harness.takeoverOffers.offers).toHaveLength(2);
    expect(surface.writes.at(-1)).toBe("\x1b[?1000l\x1b[?1006l");

    const secondOffer = harness.takeoverOffers.offers[1];
    assert(secondOffer);
    secondOffer.onConfirm();
    expect(mouseAttach.stopRequested).toBe(true);
    mouseAttach.settleStop();
    await vi.waitFor(() =>
      expect(harness.running()).toEqual([
        { kind: "observe", terminalId: initialPane.terminalId, ...initialDimensions },
      ]),
    );

    surface.pty.handleInput?.("keyboard while displaced\r");
    const keyboardAttach = harness.onlyRunning("attach");
    expect(keyboardAttach.inputs).toEqual(["keyboard while displaced\r"]);
    expect(harness.takeoverOffers.offers).toHaveLength(3);
  });

  it("A4 ignores confirms from an old attach, after D1 is lost, and after disposal", async () => {
    const otherPane = pane("pane-2", "terminal-2");
    const panes = [initialPane, otherPane];
    const harness = createHarness({ initialProjection: connected(sessionId, panes, initialPane.id) });
    const surface = harness.createSurface();
    surface.pty.open(initialDimensions);
    harness.selection.select(initialSelection);
    const oldOffer = harness.takeoverOffers.offers[0];
    assert(oldOffer);

    harness.onlyRunning("attach").complete();
    await vi.waitFor(() => expect(oldOffer.retractCount).toBe(1));
    surface.pty.handleInput?.("reattach");
    const currentAttach = harness.onlyRunning("attach");
    const currentOffer = harness.takeoverOffers.offers[1];
    assert(currentOffer);
    oldOffer.onConfirm();
    expect(currentAttach.stopRequested).toBe(false);
    expect(harness.running()).toEqual([{ kind: "attach", terminalId: initialPane.terminalId, ...initialDimensions }]);

    harness.projection.setState(connected(sessionId, panes, otherPane.id));
    expect(currentOffer.retractCount).toBe(1);
    currentOffer.onConfirm();
    expect(currentAttach.stopRequested).toBe(false);
    expect(harness.running()).toEqual([{ kind: "attach", terminalId: initialPane.terminalId, ...initialDimensions }]);

    harness.projection.setState(connected(sessionId, panes, initialPane.id));
    const finalOffer = harness.takeoverOffers.offers[2];
    assert(finalOffer);
    const attachCount = harness.paneClients.attaches.length;
    const observerCount = harness.paneClients.observers.length;
    surface.surface.dispose();
    expect(finalOffer.retractCount).toBe(1);
    finalOffer.onConfirm();
    expect(harness.paneClients.attaches).toHaveLength(attachCount);
    expect(harness.paneClients.observers).toHaveLength(observerCount);
  });
});
