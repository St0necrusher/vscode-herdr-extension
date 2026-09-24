"use strict";

// THROWAWAY PROTOTYPE. This is evidence for issue #16, not production code.

const vscode = require("vscode");
const nodePty = require("node-pty");
const { spawn } = require("node:child_process");
const { StringDecoder } = require("node:string_decoder");
const fs = require("node:fs");
const path = require("node:path");
const { PopupProbe } = require("./popup-probe.cjs");

const output = vscode.window.createOutputChannel(
  "Herdr Direct Attach Handoff Prototype",
  { log: true },
);
const surfaces = new Map();
let popupProbe;

function isVisibleAttachedSurface(surface) {
  const terminal = vscode.window.activeTerminal;
  const visibleTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
  return (
    vscode.window.state.focused &&
    surface === surfaces.get(terminal) &&
    visibleTab?.input instanceof vscode.TabInputTerminal &&
    visibleTab.label === terminal?.name &&
    surface?.mode === "attached" &&
    surface.current?.kind === "attach"
  );
}

function syncPopupOffer() {
  const surface = surfaces.get(vscode.window.activeTerminal);
  if (!isVisibleAttachedSurface(surface)) {
    popupProbe?.hide();
    return;
  }
  popupProbe?.offer(surface, surface.binary, surface.session);
}

const HOST_MODE_RESET =
  "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1049l";
const SCREEN_RESET = `${HOST_MODE_RESET}\x1b[3J\x1b[2J\x1b[H`;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function settlesWithin(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function environmentWith(overrides) {
  return Object.fromEntries(
    Object.entries({ ...process.env, ...overrides }).filter(
      ([, value]) => typeof value === "string",
    ),
  );
}

class DirectAttachHandoffSurface {
  constructor({ binary, session, terminalId, configPath, idleReleaseMs }) {
    this.binary = binary;
    this.session = session;
    this.terminalId = terminalId;
    this.configPath = configPath;
    this.idleReleaseMs = idleReleaseMs;
    this.dimensions = { columns: 120, rows: 40 };
    this.mode = "idle";
    this.desiredMode = "observe";
    this.current = undefined;
    this.generation = 0;
    this.pendingInput = [];
    this.disposed = false;
    this.transition = Promise.resolve();
    this.resizeTimer = undefined;
    this.idleTimer = undefined;
    this.writeEmitter = new vscode.EventEmitter();
    this.closeEmitter = new vscode.EventEmitter();
    this.onDidWrite = this.writeEmitter.event;
    this.onDidClose = this.closeEmitter.event;
  }

  open(initialDimensions) {
    if (initialDimensions) this.dimensions = initialDimensions;
    output.info(
      `surface ${this.terminalId}: open ${this.dimensions.columns}x${this.dimensions.rows}`,
    );
    this.observe("surface opened");
  }

  close() {
    if (this.disposed) return;
    popupProbe?.hide(this);
    this.disposed = true;
    this.desiredMode = "closed";
    clearTimeout(this.resizeTimer);
    clearTimeout(this.idleTimer);
    this.enqueue("surface closed", async () => {
      await this.stopCurrent("surface closed");
      this.mode = "closed";
      this.writeEmitter.dispose();
      this.closeEmitter.dispose();
    });
  }

  handleInput(data) {
    if (this.disposed || data.length === 0) return;

    const current = this.current;
    if (current?.kind === "attach" && this.mode === "attached") {
      this.noteLocalActivity("terminal input");
      current.pty.write(data);
      return;
    }

    this.pendingInput.push(data);
    output.info(
      `surface ${this.terminalId}: buffered local input (${Buffer.byteLength(data)} bytes)`,
    );
    this.takeControl("local input");
  }

  setDimensions(dimensions) {
    this.dimensions = dimensions;
    const current = this.current;
    if (current?.kind === "attach") {
      this.noteLocalActivity("terminal resize");
      try {
        current.pty.resize(dimensions.columns, dimensions.rows);
        output.debug(
          `surface ${this.terminalId}: attach resize ${dimensions.columns}x${dimensions.rows}`,
        );
      } catch (error) {
        output.error(
          `surface ${this.terminalId}: attach resize failed: ${error.message}`,
        );
      }
      return;
    }

    if (this.mode === "observing") {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(
        () => this.observe("observer dimensions changed", true),
        120,
      );
    }
  }

  takeControl(reason) {
    if (this.disposed) return;
    this.desiredMode = "attach";
    if (this.current?.kind === "attach") {
      this.noteLocalActivity(reason);
    }
    this.enqueue(`take control: ${reason}`, async () => {
      if (this.disposed || this.desiredMode !== "attach") return;
      if (this.current?.kind === "attach") return;

      await this.stopCurrent(`take control: ${reason}`);
      if (this.disposed || this.desiredMode !== "attach") return;
      this.startAttach(reason);
    });
  }

  observe(reason, forceRestart = false) {
    if (this.disposed) return;
    popupProbe?.hide(this);
    this.desiredMode = "observe";
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    if (this.pendingInput.length > 0) {
      const bytes = this.pendingInput.reduce(
        (total, chunk) => total + Buffer.byteLength(chunk),
        0,
      );
      output.warn(
        `surface ${this.terminalId}: discarding ${bytes} buffered bytes while yielding`,
      );
      this.pendingInput = [];
    }

    this.enqueue(`observe: ${reason}`, async () => {
      if (this.disposed || this.desiredMode !== "observe") return;
      if (this.current?.kind === "observer" && !forceRestart) return;

      await this.stopCurrent(`observe: ${reason}`);
      if (this.disposed || this.desiredMode !== "observe") return;
      this.startObserver(reason);
    });
  }

  noteLocalActivity(reason) {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    if (
      this.idleReleaseMs <= 0 ||
      this.disposed ||
      this.desiredMode !== "attach" ||
      this.current?.kind !== "attach"
    ) {
      return;
    }

    const generation = this.current.generation;
    output.debug(
      `surface ${this.terminalId}: idle release armed for ${this.idleReleaseMs} ms (${reason})`,
    );
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (
        this.disposed ||
        this.desiredMode !== "attach" ||
        this.current?.kind !== "attach" ||
        this.current.generation !== generation
      ) {
        return;
      }
      output.info(
        `surface ${this.terminalId}: ${this.idleReleaseMs} ms local inactivity; yielding`,
      );
      this.observe(`idle timeout (${this.idleReleaseMs} ms)`);
    }, this.idleReleaseMs);
  }

  enqueue(label, operation) {
    this.transition = this.transition
      .then(async () => {
        output.info(`surface ${this.terminalId}: transition ${label}`);
        await operation();
      })
      .catch((error) => {
        output.error(
          `surface ${this.terminalId}: transition failed (${label}): ${error.stack ?? error.message}`,
        );
        void vscode.window.showErrorMessage(
          `Herdr handoff prototype failed: ${error.message}`,
        );
      });
  }

  commandArgs(...command) {
    const args = [];
    if (this.session) args.push("--session", this.session);
    args.push(...command);
    return args;
  }

  startAttach(reason) {
    const generation = ++this.generation;
    const args = this.commandArgs(
      "terminal",
      "attach",
      this.terminalId,
      "--takeover",
    );
    const env = environmentWith({
      HERDR_CONFIG_PATH: this.configPath,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    });

    output.info(
      `surface ${this.terminalId}: spawn direct attach (${reason}): ${this.binary} ${args.join(" ")}`,
    );
    this.mode = "attaching";

    let pty;
    try {
      pty = nodePty.spawn(this.binary, args, {
        name: "xterm-256color",
        cols: this.dimensions.columns,
        rows: this.dimensions.rows,
        cwd: process.cwd(),
        env,
      });
    } catch (error) {
      this.mode = "idle";
      this.desiredMode = "observe";
      output.error(
        `surface ${this.terminalId}: direct attach spawn failed: ${error.stack ?? error.message}`,
      );
      void vscode.window.showErrorMessage(
        `Could not start Herdr direct attach: ${error.message}`,
      );
      this.observe("direct attach spawn failed");
      return;
    }

    let resolveExit;
    const exitPromise = new Promise((resolve) => {
      resolveExit = resolve;
    });
    const dataDisposable = pty.onData((data) => {
      if (this.current?.generation !== generation) return;
      this.writeEmitter.fire(data);
      if (this.mode === "attaching") {
        this.mode = "attached";
        output.info(`surface ${this.terminalId}: direct attach ready`);
        this.noteLocalActivity("direct attach ready");
        syncPopupOffer();
        const pending = this.pendingInput;
        this.pendingInput = [];
        for (const chunk of pending) pty.write(chunk);
        if (pending.length > 0) {
          const bytes = pending.reduce(
            (total, chunk) => total + Buffer.byteLength(chunk),
            0,
          );
          output.info(
            `surface ${this.terminalId}: flushed ${bytes} buffered bytes`,
          );
        }
      }
    });
    const exitDisposable = pty.onExit((event) => {
      resolveExit(event);
      if (this.current?.generation !== generation) return;
      popupProbe?.hide(this);
      this.current = undefined;
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
      this.mode = "idle";
      output.warn(
        `surface ${this.terminalId}: direct attach exited code=${event.exitCode} signal=${event.signal}`,
      );
      if (!this.disposed && this.desiredMode === "attach") {
        this.desiredMode = "observe";
        this.observe("direct attach exited");
      }
    });

    this.current = {
      kind: "attach",
      generation,
      pty,
      dataDisposable,
      exitDisposable,
      exitPromise,
    };
  }

  startObserver(reason) {
    const generation = ++this.generation;
    const args = this.commandArgs(
      "terminal",
      "session",
      "observe",
      this.terminalId,
      "--cols",
      String(this.dimensions.columns),
      "--rows",
      String(this.dimensions.rows),
    );

    output.info(
      `surface ${this.terminalId}: spawn observer (${reason}): ${this.binary} ${args.join(" ")}`,
    );
    this.mode = "observing";
    this.writeEmitter.fire(SCREEN_RESET);

    const child = spawn(this.binary, args, {
      // Keep stdin open. The terminal-session CLI treats EOF as client detach.
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: environmentWith({ HERDR_CONFIG_PATH: this.configPath }),
    });

    let resolveExit;
    const exitPromise = new Promise((resolve) => {
      resolveExit = resolve;
    });
    const current = {
      kind: "observer",
      generation,
      child,
      exitPromise,
      stdoutRemainder: "",
      decoder: new StringDecoder("utf8"),
      installedFirstFrame: false,
    };
    this.current = current;

    child.stdout.on("data", (chunk) => {
      if (this.current?.generation !== generation) return;
      current.stdoutRemainder += chunk.toString("utf8");
      for (;;) {
        const newline = current.stdoutRemainder.indexOf("\n");
        if (newline < 0) break;
        const line = current.stdoutRemainder.slice(0, newline).trim();
        current.stdoutRemainder = current.stdoutRemainder.slice(newline + 1);
        if (line) this.consumeObserverRecord(current, line);
      }
    });
    child.stderr.on("data", (chunk) => {
      if (this.current?.generation !== generation) return;
      output.error(
        `surface ${this.terminalId}: observer stderr: ${chunk.toString("utf8").trimEnd()}`,
      );
    });
    child.on("error", (error) => {
      if (this.current?.generation !== generation) return;
      output.error(
        `surface ${this.terminalId}: observer spawn failed: ${error.message}`,
      );
      void vscode.window.showErrorMessage(
        `Could not start Herdr observer: ${error.message}`,
      );
    });
    child.on("exit", (code, signal) => {
      resolveExit({ code, signal });
      if (this.current?.generation !== generation) return;
      this.current = undefined;
      this.mode = "idle";
      output.warn(
        `surface ${this.terminalId}: observer exited code=${code} signal=${signal}`,
      );
    });
  }

  consumeObserverRecord(current, line) {
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      output.error(
        `surface ${this.terminalId}: invalid observer NDJSON: ${error.message}; ${line}`,
      );
      return;
    }

    if (record.type === "terminal.frame") {
      if (!current.installedFirstFrame) {
        current.installedFirstFrame = true;
        this.writeEmitter.fire(SCREEN_RESET);
      }
      const bytes = Buffer.from(record.bytes, "base64");
      this.writeEmitter.fire(current.decoder.write(bytes));
      output.debug(
        `surface ${this.terminalId}: observer frame seq=${record.seq} ${record.width}x${record.height} full=${record.full}`,
      );
      return;
    }

    if (record.type === "terminal.closed") {
      output.warn(
        `surface ${this.terminalId}: observer closed: ${record.reason ?? "no reason"}`,
      );
      return;
    }

    if (record.type !== "subscription_started") {
      output.warn(
        `surface ${this.terminalId}: unknown observer record: ${line}`,
      );
    }
  }

  async stopCurrent(reason) {
    const current = this.current;
    if (!current) return;

    if (current.kind === "attach") {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
    output.info(`surface ${this.terminalId}: stop ${current.kind} (${reason})`);

    if (current.kind === "attach") {
      // This is the documented interactive detach sequence used by the direct client.
      // If graceful detach stalls, terminating only this client still lets Herdr clean
      // up the direct-attach lease without touching the server-owned Pane process.
      current.pty.write("\x02q");
      if (!(await settlesWithin(current.exitPromise, 600))) {
        output.warn(
          `surface ${this.terminalId}: direct attach did not detach; sending SIGTERM`,
        );
        try {
          current.pty.kill("SIGTERM");
        } catch (error) {
          output.warn(
            `surface ${this.terminalId}: direct attach SIGTERM failed: ${error.message}`,
          );
        }
        if (!(await settlesWithin(current.exitPromise, 750))) {
          output.warn(
            `surface ${this.terminalId}: direct attach survived SIGTERM; sending SIGKILL`,
          );
          try {
            current.pty.kill("SIGKILL");
          } catch (error) {
            output.warn(
              `surface ${this.terminalId}: direct attach SIGKILL failed: ${error.message}`,
            );
          }
          await settlesWithin(current.exitPromise, 250);
        }
      }
      if (this.current === current) this.current = undefined;
      ++this.generation;
      current.dataDisposable.dispose();
      current.exitDisposable.dispose();
      await delay(100);
      return;
    }

    current.child.stdin.end();
    current.child.kill("SIGTERM");
    if (!(await settlesWithin(current.exitPromise, 500))) {
      current.child.kill("SIGKILL");
      await settlesWithin(current.exitPromise, 250);
    }
    if (this.current === current) this.current = undefined;
    ++this.generation;
  }
}

function createIsolatedConfig(context) {
  const directory = context.globalStorageUri.fsPath;
  fs.mkdirSync(directory, { recursive: true });
  const configPath = path.join(directory, "direct-attach-prototype.toml");
  fs.writeFileSync(configPath, "[ui]\nmouse_capture = false\n", "utf8");
  output.info(`isolated Herdr config: ${configPath}`);
  return configPath;
}

async function askTerminalId() {
  return vscode.window.showInputBox({
    title: "Open an existing Herdr terminal",
    prompt: "Enter the terminal ID reported by `herdr pane list`",
    placeHolder: "term_…",
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() ? undefined : "Enter a terminal ID",
  });
}

function activePrototypeSurface() {
  const terminal = vscode.window.activeTerminal;
  return terminal ? surfaces.get(terminal) : undefined;
}

async function openPrototype(configPath) {
  const terminalId = await askTerminalId();
  if (!terminalId) return;

  const config = vscode.workspace.getConfiguration("herdrPrototype");
  const binary = config.get("binary", "herdr").trim() || "herdr";
  const session = config.get("session", "").trim();
  const configuredIdleReleaseMs = config.get("idleReleaseMs", 0);
  const idleReleaseMs = Number.isFinite(configuredIdleReleaseMs)
    ? Math.max(0, configuredIdleReleaseMs)
    : 0;
  const surface = new DirectAttachHandoffSurface({
    binary,
    session,
    terminalId: terminalId.trim(),
    configPath,
    idleReleaseMs,
  });
  const terminal = vscode.window.createTerminal({
    name: `Herdr ${terminalId.trim()} (handoff prototype)`,
    pty: surface,
    location: vscode.TerminalLocation.Editor,
    isTransient: true,
  });
  surfaces.set(terminal, surface);
  terminal.show();
}

function updateFocus(activeTerminal, windowFocused, reason) {
  const config = vscode.workspace.getConfiguration("herdrPrototype");
  const autoYield = config.get("autoYieldOnBlur", true);
  const autoTake = config.get("autoTakeOnFocus", true);

  for (const [terminal, surface] of surfaces) {
    const focused = windowFocused && terminal === activeTerminal;
    if (focused && autoTake) surface.takeControl(reason);
    else if (!focused && autoYield) surface.observe(reason);
  }
  syncPopupOffer();
}

async function activate(context) {
  const configPath = createIsolatedConfig(context);
  popupProbe = new PopupProbe(output, (surface) => {
    if (!isVisibleAttachedSurface(surface)) {
      output.warn("popup probe: ignored stale mobile request");
      return undefined;
    }
    const generation = surface.generation;
    return () => {
      if (
        surface.generation !== generation ||
        !isVisibleAttachedSurface(surface)
      ) {
        output.warn("popup probe: ignored superseded mobile request");
        return;
      }
      output.info(
        `popup probe: mobile Yield requested for ${surface.terminalId}`,
      );
      surface.observe("mobile popup confirmed Yield");
    };
  });
  await popupProbe.start();

  context.subscriptions.push(
    output,
    popupProbe,
    vscode.window.tabGroups.onDidChangeTabs(syncPopupOffer),
    vscode.window.tabGroups.onDidChangeTabGroups(syncPopupOffer),
    vscode.commands.registerCommand(
      "herdrPrototype.openDirectAttachHandoff",
      () => openPrototype(configPath),
    ),
    vscode.commands.registerCommand("herdrPrototype.yieldControl", () => {
      const surface = activePrototypeSurface();
      if (!surface) {
        void vscode.window.showInformationMessage(
          "Focus a direct-attach handoff prototype terminal first.",
        );
        return;
      }
      surface.observe("explicit Yield Control command");
    }),
    vscode.commands.registerCommand("herdrPrototype.takeControl", () => {
      const surface = activePrototypeSurface();
      if (!surface) {
        void vscode.window.showInformationMessage(
          "Focus a direct-attach handoff prototype terminal first.",
        );
        return;
      }
      surface.takeControl("explicit Take Control command");
    }),
    vscode.window.onDidChangeActiveTerminal((terminal) => {
      output.info(`active terminal: ${terminal?.name ?? "none"}`);
      updateFocus(
        terminal,
        vscode.window.state.focused,
        "active terminal changed",
      );
    }),
    vscode.window.onDidChangeWindowState((state) => {
      output.info(`VS Code window focused=${state.focused}`);
      updateFocus(
        vscode.window.activeTerminal,
        state.focused,
        "VS Code window focus changed",
      );
    }),
    vscode.window.onDidCloseTerminal((terminal) => {
      const surface = surfaces.get(terminal);
      if (!surface) return;
      surfaces.delete(terminal);
      surface.close();
    }),
    {
      dispose() {
        for (const surface of surfaces.values()) surface.close();
        surfaces.clear();
      },
    },
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
