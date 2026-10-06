import * as vscode from "vscode";
import type { HerdrLogger } from "@capabilities/runtime";
import type { ActiveSessionProjectionSource, ActiveSessionProjectionState, HerdrPane } from "@capabilities/sessions";
import type { PaneEditorFocusTracker } from "./PaneEditorFocusTracker";
import type { PaneClientFactory, PaneClientRequest } from "./HerdrPaneClientFactory";
import type { PaneAttach } from "./HerdrPaneAttach";
import type { PaneObserver } from "./HerdrPaneObserver";
import type { SelectedPaneEditor } from "./PaneEditorSelectionModel";
import type { PaneOutputSink } from "./PaneOutputSink";
import { observerFailurePlaceholder, paneName, paneTarget, type PaneTarget } from "./paneTarget";
import { desiredClient, type AttachIntent, type DesiredClient, type PaneEditorVisibility } from "./paneClientPolicy";
import type { TakeoverOffer, TakeoverOffers } from "./takeover";

export interface PaneTerminalSurface {
  readonly terminal: vscode.Terminal;
  readonly onDidClose: vscode.Event<void>;
  reveal(): void;
  move(pane: HerdrPane): void;
  showPaneName(): void;
  hidePaneName(): void;
  dispose(): void;
}

export interface PaneTerminalSurfaceFactory {
  create(selection: SelectedPaneEditor, viewColumn: vscode.ViewColumn, terminalName: string): PaneTerminalSurface;
}

const MOUSE_MODES_OFF = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l";
const SCREEN_RESET = `${MOUSE_MODES_OFF}\x1b[?1049l\x1b[3J\x1b[2J\x1b[H`;
// Herdr's own exit tail is lost when an Attach is dropped (ADR 0012): pop every kitty flag on the current, alternate and main screens, then turn off the modes the attach client enables.
const ATTACH_MODES_RESET = `\x1b[<99u\x1b[?1049h\x1b[<99u\x1b[?1049l\x1b[<99u\x1b[?2004l\x1b[?1004l${MOUSE_MODES_OFF}`;
const DISPLACED_OBSERVER_MODES_ON = "\x1b[?1000h\x1b[?1006h";
const DISPLACED_OBSERVER_MODES_OFF = "\x1b[?1000l\x1b[?1006l";
const OBSERVER_RESIZE_DEBOUNCE_MS = 120;
// Keyboard ↑/↓ arrive as these markers (package.json keybindings), so bare arrows can only be xterm.js wheel emulation in the alternate screen.
const ARROW_UP_MARKER = "\x1b]herdr;arrow-up\x07";
const ARROW_DOWN_MARKER = "\x1b]herdr;arrow-down\x07";
const BARE_ARROWS = /^(?:\x1b[[O][AB])+$/; // eslint-disable-line no-control-regex

type IdleClient = Readonly<{ kind: "idle" }>;
interface ObservingClient {
  kind: "observing";
  observer: PaneObserver;
  request: PaneClientRequest;
  resizeTimer: ReturnType<typeof setTimeout> | undefined;
}
type ObserverFailedClient = Readonly<{ kind: "observer-failed" }>;
interface AttachedClient {
  kind: "attached";
  attach: PaneAttach;
  request: PaneClientRequest;
}
type PaneClientState = IdleClient | ObservingClient | ObserverFailedClient | AttachedClient;
type DisplacedInputClassification = "local-intent" | "ignored" | "other";

function isTakeoverEligible(
  client: PaneClientState,
  visibility: PaneEditorVisibility,
  target: PaneTarget,
  projection: ActiveSessionProjectionState,
  selection: SelectedPaneEditor,
): client is AttachedClient {
  return (
    client.kind === "attached" &&
    visibility === "focused" &&
    target.kind === "live" &&
    projection.kind === "connected" &&
    projection.snapshot.focusedPaneId === selection.paneId
  );
}

function isDisplacedObserving(client: PaneClientState, attachIntent: AttachIntent): boolean {
  return attachIntent === "displaced" && client.kind === "observing";
}

function classifyDisplacedInput(input: string): DisplacedInputClassification {
  const reportPattern = /\x1b\[<(\d+);\d+;\d+([Mm])|\x1b\[[IO]|\x1b(?:\[|O)[AB]/g; // eslint-disable-line no-control-regex
  const reports = Array.from(input.matchAll(reportPattern));
  const reportsCoverWholeInput = reports.length > 0 && reports.map((report) => report[0]).join("") === input;
  if (!reportsCoverWholeInput) return "other";

  const containsLocalIntent = reports.some((report) => {
    const mouseAction = report[2];
    const isMousePress = mouseAction === "M";
    const mouseButton = report[1];
    const isWheel = mouseButton !== undefined && (Number(mouseButton) & 64) !== 0;
    const isNonWheelPress = isMousePress && !isWheel;
    return isNonWheelPress;
  });
  return containsLocalIntent ? "local-intent" : "ignored";
}

type ClosedHost = Readonly<{ kind: "closed" }>;
type OpenHost = Readonly<{ kind: "open"; dimensions: vscode.TerminalDimensions | undefined }>;
type PseudoterminalHost = ClosedHost | OpenHost;

export class VsCodePaneTerminalSurface implements PaneTerminalSurface, PaneOutputSink {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly nameEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<void>();
  readonly onDidClose = this.closeEmitter.event;
  private readonly projectionSubscription: { dispose(): void };
  readonly terminal: vscode.Terminal;
  private applicationCursor = false;
  private focusSubscription: { dispose(): void };
  private selection: SelectedPaneEditor;
  private projection: ActiveSessionProjectionState;
  private movedPane: HerdrPane | undefined;
  private visibility: PaneEditorVisibility = "hidden";
  private host: PseudoterminalHost = { kind: "closed" };
  private client: PaneClientState = { kind: "idle" };
  private stoppingAttach: Promise<void> | undefined;
  private takeoverOffer: { client: AttachedClient; offer: TakeoverOffer } | undefined;
  private attachIntent: AttachIntent = "wanted";
  private displacedObserverModesEnabled = false;
  private visiblePlaceholder: string | undefined;
  private publishedName: string | undefined;
  private paneNameVisible = false;
  private revealOnOpen = false;
  private disposed = false;

  constructor(
    selection: SelectedPaneEditor,
    viewColumn: vscode.ViewColumn,
    private readonly terminalName: string,
    projectionSource: ActiveSessionProjectionSource,
    private readonly focusTracker: PaneEditorFocusTracker,
    private readonly paneClients: PaneClientFactory,
    private readonly takeoverOffers: TakeoverOffers,
    private readonly logger: HerdrLogger,
  ) {
    this.selection = selection;
    this.projection = projectionSource.getActiveSessionProjection();
    this.focusSubscription = this.subscribeToFocus();

    const pty: vscode.Pseudoterminal = {
      onDidWrite: this.writeEmitter.event,
      onDidChangeName: this.nameEmitter.event,
      handleInput: (data) => this.handleInput(data),
      open: (dimensions) => {
        this.host = { kind: "open", dimensions };
        if (this.revealOnOpen) {
          this.revealOnOpen = false;
          this.terminal.show();
        }
        if (this.client.kind === "observer-failed") this.client = { kind: "idle" };
        this.publishPaneName();
        this.converge();
      },
      // VS Code closes the terminal here even when it skips onDidCloseTerminal (closing a tab after a group move).
      close: () => this.closeEmitter.fire(),
      setDimensions: (dimensions) => this.updateDimensions(dimensions),
    };

    // No `name` (not even ""): VS Code would treat it as an API title and ignore every later onDidChangeName.
    this.terminal = vscode.window.createTerminal({
      pty,
      location: { viewColumn },
      isTransient: true,
    } as vscode.ExtensionTerminalOptions);
    this.projectionSubscription = projectionSource.onDidChangeActiveSessionProjection((projection) => {
      this.projection = projection;
      this.movedPane = undefined;
      if (this.client.kind === "observer-failed") this.client = { kind: "idle" };
      this.publishPaneName();
      this.converge();
    });
  }

  reveal(): void {
    this.terminal.show();
    // The first terminal of a window opens its editor before VS Code creates its xterm, which drops that focus (ADR 0013).
    if (this.host.kind === "closed") this.revealOnOpen = true;
  }

  move(pane: HerdrPane): void {
    this.focusSubscription.dispose();
    this.selection = { sessionId: this.selection.sessionId, paneId: pane.id };
    this.movedPane = pane;
    if (this.client.kind === "observer-failed") this.client = { kind: "idle" };
    this.focusSubscription = this.subscribeToFocus();
    this.publishPaneName();
    this.converge();
  }

  showPaneName(): void {
    if (this.paneNameVisible) return;
    this.paneNameVisible = true;
    this.publishPaneName();
  }

  hidePaneName(): void {
    this.paneNameVisible = false;
    this.publishPaneName();
  }

  append(data: string): void {
    if (this.host.kind !== "open" || data.length === 0) return;
    this.visiblePlaceholder = undefined;
    this.writeEmitter.fire(data);
  }

  replace(data: string): void {
    if (this.host.kind !== "open") return;
    this.visiblePlaceholder = undefined;
    this.writeEmitter.fire(`${SCREEN_RESET}${data}`);
    this.syncDisplacedObserverModes(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseClient();
    this.retractTakeoverOffer();
    this.projectionSubscription.dispose();
    this.focusSubscription.dispose();
    this.terminal.dispose();
    this.writeEmitter.dispose();
    this.nameEmitter.dispose();
    this.closeEmitter.dispose();
  }

  private subscribeToFocus(): { dispose(): void } {
    return this.focusTracker.subscribe(this.selection, (focus) => {
      const nextVisibility: PaneEditorVisibility =
        focus.reason === "editor-hidden" ? "hidden" : focus.reason === "window-blurred" ? "blurred" : "focused";
      if (nextVisibility === this.visibility) return;
      if (nextVisibility === "focused") this.attachIntent = "wanted";
      this.visibility = nextVisibility;
      if (this.client.kind === "observer-failed") this.client = { kind: "idle" };
      this.converge();
    });
  }

  private updateDimensions(dimensions: vscode.TerminalDimensions | undefined): void {
    const currentDimensions = this.host.kind === "open" ? this.host.dimensions : undefined;
    const dimensionsAreUnchanged =
      currentDimensions?.columns === dimensions?.columns && currentDimensions?.rows === dimensions?.rows;
    if (dimensionsAreUnchanged) return;
    this.host = { kind: "open", dimensions };

    if (this.client.kind === "observing") this.scheduleObserverResize(this.client);
    else if (this.client.kind === "observer-failed") this.client = { kind: "idle" };
    this.converge();
  }

  private publishPaneName(): void {
    if (this.host.kind !== "open") return;
    if (!this.paneNameVisible) {
      this.nameEmitter.fire(this.terminalName);
      return;
    }
    const target = paneTarget(this.projection, this.selection, this.movedPane);
    const name =
      target.kind === "live"
        ? paneName(target.pane, this.selection.paneId)
        : (this.publishedName ?? paneName(undefined, this.selection.paneId));
    this.publishedName = name;
    // VS Code cuts a process title at its first space; no-break spaces keep the whole name.
    this.nameEmitter.fire(name.replaceAll(" ", "\u00a0"));
  }

  private render(): void {
    if (this.host.kind !== "open") return;
    const target = paneTarget(this.projection, this.selection, this.movedPane);
    const shouldPresentObserverFailure = this.client.kind === "observer-failed" && this.visibility !== "hidden";
    const placeholder =
      target.kind === "suspended"
        ? target.placeholder
        : shouldPresentObserverFailure
          ? observerFailurePlaceholder(this.selection)
          : undefined;
    if (placeholder === undefined) {
      if (this.visiblePlaceholder !== undefined) {
        this.visiblePlaceholder = undefined;
        this.writeEmitter.fire(SCREEN_RESET);
        this.syncDisplacedObserverModes(true);
      }
      return;
    }
    if (placeholder === this.visiblePlaceholder) return;
    this.visiblePlaceholder = placeholder;
    this.writeEmitter.fire(`${SCREEN_RESET}${placeholder}`);
    this.syncDisplacedObserverModes(true);
  }

  private syncDisplacedObserverModes(afterScreenReset = false): void {
    const displacedObserving = isDisplacedObserving(this.client, this.attachIntent);
    const shouldEnableModes = displacedObserving && (!this.displacedObserverModesEnabled || afterScreenReset);
    const shouldDisableModes = !displacedObserving && this.displacedObserverModesEnabled;
    if (shouldEnableModes) {
      this.displacedObserverModesEnabled = true;
      this.writeEmitter.fire(DISPLACED_OBSERVER_MODES_ON);
    } else if (shouldDisableModes) {
      this.displacedObserverModesEnabled = false;
      this.writeEmitter.fire(DISPLACED_OBSERVER_MODES_OFF);
    }
  }

  private converge(): void {
    if (this.disposed) return;
    const dimensions = this.host.kind === "open" ? this.host.dimensions : undefined;
    const target = paneTarget(this.projection, this.selection, this.movedPane);
    const desired = desiredClient({
      target: target.kind === "live" ? target.pane : undefined,
      sessionId: this.selection.sessionId,
      visibility: this.visibility,
      dimensions,
      intent: this.attachIntent,
    });

    if (!this.satisfies(desired)) {
      this.releaseClient();
      if (desired.kind === "observe") this.startObserver(desired.request);
      if (desired.kind === "attach" && this.stoppingAttach === undefined) this.startAttach(desired.request);
    }
    this.render();
    this.syncTakeoverOffer(target);
    this.syncDisplacedObserverModes();
  }

  private syncTakeoverOffer(target: PaneTarget): void {
    const client = this.client;
    const eligible = isTakeoverEligible(client, this.visibility, target, this.projection, this.selection);
    const currentOffer = this.takeoverOffer;
    const shouldRetractCurrentOffer = currentOffer !== undefined && (currentOffer.client !== client || !eligible);
    if (shouldRetractCurrentOffer) this.retractTakeoverOffer();
    if (!eligible || this.takeoverOffer !== undefined) return;

    const offer = this.takeoverOffers.offer({
      sessionId: this.selection.sessionId,
      paneId: this.selection.paneId,
      onConfirm: () => this.yieldToTakeover(client),
    });
    this.takeoverOffer = { client, offer };
  }

  private yieldToTakeover(client: AttachedClient): void {
    const currentTarget = paneTarget(this.projection, this.selection, this.movedPane);
    const canYield =
      !this.disposed &&
      this.client === client &&
      isTakeoverEligible(this.client, this.visibility, currentTarget, this.projection, this.selection);
    if (!canYield) return;
    this.attachIntent = "displaced";
    this.converge();
  }

  private retractTakeoverOffer(): void {
    const currentOffer = this.takeoverOffer;
    if (currentOffer === undefined) return;
    this.takeoverOffer = undefined;
    currentOffer.offer.retract();
  }

  private satisfies(desired: DesiredClient): boolean {
    const client = this.client;
    if (desired.kind === "none") return client.kind === "idle";
    if (desired.kind === "observe") {
      if (client.kind === "observer-failed") return true;
      if (client.kind !== "observing") return false;
      const sameObserverTarget =
        client.request.sessionId === desired.request.sessionId &&
        client.request.terminalId === desired.request.terminalId;
      return sameObserverTarget;
    }

    if (client.kind !== "attached") return false;
    const sameAttachTarget =
      client.request.sessionId === desired.request.sessionId &&
      client.request.terminalId === desired.request.terminalId;
    if (!sameAttachTarget) return false;
    const dimensionsChanged =
      client.request.columns !== desired.request.columns || client.request.rows !== desired.request.rows;
    if (dimensionsChanged) {
      client.attach.resize(desired.request.columns, desired.request.rows);
      client.request = desired.request;
    }
    return true;
  }

  private releaseClient(): void {
    const client = this.client;
    if (client.kind === "observing") {
      this.clearObserverResizeTimer(client);
      void client.observer.stop();
    }
    if (client.kind === "attached") {
      this.resetAttachModes();
      this.stoppingAttach = client.attach.stop().then(() => {
        this.stoppingAttach = undefined;
        this.converge();
      });
    }
    this.client = { kind: "idle" };
  }

  private resetAttachModes(): void {
    if (this.host.kind === "open") this.writeEmitter.fire(ATTACH_MODES_RESET);
  }

  private startObserver(request: PaneClientRequest): void {
    let observing: ObservingClient | undefined;
    const sink: PaneOutputSink = {
      append: (data) => {
        const sinkIsCurrent = this.client === observing;
        if (sinkIsCurrent) this.append(data);
      },
      replace: (data) => {
        const sinkIsCurrent = this.client === observing;
        if (sinkIsCurrent) this.replace(data);
      },
    };

    try {
      const observer = this.paneClients.createObserver(request, sink);
      const createdClient: ObservingClient = { kind: "observing", observer, request, resizeTimer: undefined };
      observing = createdClient;
      this.client = createdClient;
      void observer.completion.then(() => this.handleObserverCompletion(createdClient));
    } catch (error) {
      this.client = { kind: "observer-failed" };
      this.logger.error(
        `Could not create the Herdr Pane observer for Session "${request.sessionId}" terminal "${request.terminalId}".`,
        error,
      );
    }
  }

  private handleObserverCompletion(client: ObservingClient): void {
    const completionIsCurrent = !this.disposed && this.client === client;
    if (!completionIsCurrent) return;
    this.clearObserverResizeTimer(client);
    this.client = { kind: "observer-failed" };
    this.logger.error(
      `The Herdr Pane observer completed unexpectedly for Session "${client.request.sessionId}" terminal "${client.request.terminalId}".`,
    );
    this.converge();
  }

  private startAttach(request: PaneClientRequest): void {
    let attached: AttachedClient | undefined;
    const sink: PaneOutputSink = {
      append: (data) => {
        const sinkIsCurrent = this.client === attached;
        if (!sinkIsCurrent) return;
        const lastApplicationCursorModeOn = data.lastIndexOf("\x1b[?1h");
        const lastApplicationCursorModeOff = data.lastIndexOf("\x1b[?1l");
        if (lastApplicationCursorModeOn !== lastApplicationCursorModeOff) {
          this.applicationCursor = lastApplicationCursorModeOn > lastApplicationCursorModeOff;
        }
        this.append(data);
      },
      replace: (data) => {
        const sinkIsCurrent = this.client === attached;
        if (sinkIsCurrent) this.replace(data);
      },
    };

    try {
      const attach = this.paneClients.createAttach(request, sink);
      const createdClient: AttachedClient = { kind: "attached", attach, request };
      attached = createdClient;
      this.client = createdClient;
      void attach.completion.then(() => this.handleAttachCompletion(createdClient));
    } catch (error) {
      this.logger.error(
        `Could not create the Herdr Pane direct attach for Session "${request.sessionId}" terminal "${request.terminalId}".`,
        error,
      );
      this.attachIntent = "failed";
      this.client = { kind: "idle" };
      this.converge();
    }
  }

  private handleAttachCompletion(client: AttachedClient): void {
    const completionIsCurrent = !this.disposed && this.client === client;
    if (!completionIsCurrent) return;
    this.resetAttachModes();
    this.client = { kind: "idle" };
    this.attachIntent = "displaced";
    this.converge();
  }

  private scheduleObserverResize(client: ObservingClient): void {
    this.clearObserverResizeTimer(client);
    client.resizeTimer = setTimeout(() => {
      const timerIsCurrent = !this.disposed && this.client === client;
      if (!timerIsCurrent) return;
      this.releaseClient();
      this.converge();
    }, OBSERVER_RESIZE_DEBOUNCE_MS);
  }

  private clearObserverResizeTimer(client: ObservingClient): void {
    if (client.resizeTimer === undefined) return;
    clearTimeout(client.resizeTimer);
    client.resizeTimer = undefined;
  }

  private translateInput(data: string): string {
    if (data === ARROW_UP_MARKER) return this.applicationCursor ? "\x1bOA" : "\x1b[A";
    if (data === ARROW_DOWN_MARKER) return this.applicationCursor ? "\x1bOB" : "\x1b[B";
    if (BARE_ARROWS.test(data)) {
      return data.replace(/\x1b[[O]([AB])/g, (_, direction: string) => `\x1b[<${direction === "A" ? 64 : 65};1;1M`); // eslint-disable-line no-control-regex
    }
    return data;
  }

  private handleInput(input: string): void {
    const displacedObserving = isDisplacedObserving(this.client, this.attachIntent);
    if (displacedObserving) {
      const inputClassification = classifyDisplacedInput(input);
      if (inputClassification === "local-intent") {
        this.attachIntent = "wanted";
        this.converge();
        return;
      }
      if (inputClassification === "ignored") return;
    }

    const data = this.translateInput(input);
    if (data.length === 0) return;
    const client = this.client;
    if (client.kind === "attached") {
      client.attach.sendInput(data);
      return;
    }
    if (this.visibility !== "focused") return;
    if (this.attachIntent === "failed") return;
    this.attachIntent = "wanted";
    if (this.client.kind === "observer-failed") this.client = { kind: "idle" };
    this.converge();

    this.sendInputToAttachedClientOrWarn(data);
  }

  private sendInputToAttachedClientOrWarn(data: string): void {
    const client = this.client;
    if (client.kind === "attached") {
      client.attach.sendInput(data);
      return;
    }
    if (this.attachIntent === "failed") {
      void vscode.window.showWarningMessage("Could not attach to this Herdr Pane. See the Herdr output for details.");
    }
  }
}
