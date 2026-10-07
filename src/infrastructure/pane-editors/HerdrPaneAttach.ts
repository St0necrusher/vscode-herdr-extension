import type { IDisposable, IPty } from "node-pty";
import { spawn } from "node-pty";
import type { Logger } from "@core/logger";
import type { PaneOutputSink } from "./PaneOutputSink";
import { stopWithEscalation } from "./stopWithEscalation";

export interface PaneAttachRequest {
  readonly executable: string;
  readonly sessionId: string;
  readonly terminalId: string;
  readonly columns: number;
  readonly rows: number;
}

export interface PaneAttach {
  readonly completion: Promise<void>;
  sendInput(data: string): void;
  resize(columns: number, rows: number): void;
  stop(): Promise<void>;
}

const SIGTERM_WAIT_MS = 1_000;
const SIGKILL_WAIT_MS = 350;

export class HerdrPaneAttach implements PaneAttach {
  readonly completion: Promise<void>;

  private readonly pty: IPty;
  private readonly dataSubscription: IDisposable;
  private readonly exitSubscription: IDisposable;
  private resolveCompletion!: () => void;
  private stopPromise: Promise<void> | undefined;
  private completed = false;
  private exited = false;

  constructor(
    request: PaneAttachRequest,
    configPath: string,
    sink: PaneOutputSink,
    private readonly logger: Logger,
  ) {
    this.completion = new Promise<void>((resolve) => {
      this.resolveCompletion = resolve;
    });

    const args = [
      ...(request.sessionId === "default" ? [] : ["--session", request.sessionId]),
      "terminal",
      "attach",
      request.terminalId,
      "--takeover",
    ];
    this.pty = spawn(request.executable, args, {
      name: "xterm-256color",
      cols: request.columns,
      rows: request.rows,
      cwd: process.cwd(),
      env: {
        ...process.env,
        HERDR_CONFIG_PATH: configPath,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });

    this.dataSubscription = this.pty.onData((data) => {
      if (this.isActive()) sink.append(data);
    });
    this.exitSubscription = this.pty.onExit(() => {
      this.exited = true;
      this.complete();
    });
  }

  sendInput(data: string): void {
    if (this.isActive()) this.pty.write(data);
  }

  resize(columns: number, rows: number): void {
    if (this.isActive()) this.pty.resize(columns, rows);
  }

  stop(): Promise<void> {
    if (this.stopPromise !== undefined) return this.stopPromise;

    let stopPromise: Promise<void>;
    if (this.exited) {
      stopPromise = Promise.resolve();
    } else {
      stopPromise = stopWithEscalation({
        exited: this.completion,
        signal: (signal) => this.sendSignal(signal),
        termWaitMs: SIGTERM_WAIT_MS,
        killWaitMs: SIGKILL_WAIT_MS,
      }).then((exitWasConfirmed) => {
        if (exitWasConfirmed) return;
        this.logger.error("Herdr Pane direct attach exit could not be confirmed after bounded cleanup");
        this.complete();
      });
    }
    this.stopPromise = stopPromise;
    return stopPromise;
  }

  private isActive(): boolean {
    return this.stopPromise === undefined && !this.completed;
  }

  private sendSignal(signal: "SIGTERM" | "SIGKILL"): void {
    try {
      this.pty.kill(signal);
    } catch (error) {
      this.logger.error(`Could not send ${signal} to Herdr Pane direct attach`, error);
    }
  }

  private complete(): void {
    if (this.completed) return;

    this.completed = true;
    this.dataSubscription.dispose();
    this.exitSubscription.dispose();
    this.resolveCompletion();
  }
}
