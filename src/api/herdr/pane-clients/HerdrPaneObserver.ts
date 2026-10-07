import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { Logger } from "@core/logger";
import type { PaneOutputSink } from "./PaneOutputSink";
import { stopWithEscalation } from "@core/process";

export interface PaneObserverRequest {
  readonly executable: string;
  readonly sessionId: string;
  readonly terminalId: string;
  readonly columns: number;
  readonly rows: number;
}

export interface PaneObserver {
  readonly completion: Promise<void>;
  stop(): Promise<void>;
}

const SIGTERM_WAIT_MS = 500;
const SIGKILL_WAIT_MS = 250;

export class HerdrPaneObserver implements PaneObserver {
  readonly completion: Promise<void>;

  private readonly child: ChildProcessWithoutNullStreams;
  private readonly stdoutDecoder = new StringDecoder("utf8");
  private readonly frameDecoder = new StringDecoder("utf8");
  private readonly stderrDecoder = new StringDecoder("utf8");
  private readonly processExited: Promise<void>;
  private resolveCompletion!: () => void;
  private resolveProcessExited!: () => void;
  private stdoutRemainder = "";
  private stopPromise: Promise<void> | undefined;
  private muted = false;
  private closed = false;

  constructor(
    request: PaneObserverRequest,
    private readonly sink: PaneOutputSink,
    private readonly logger: Logger,
  ) {
    this.completion = new Promise<void>((resolve) => {
      this.resolveCompletion = resolve;
    });
    this.processExited = new Promise<void>((resolve) => {
      this.resolveProcessExited = resolve;
    });

    const args = [
      ...(request.sessionId === "default" ? [] : ["--session", request.sessionId]),
      "terminal",
      "session",
      "observe",
      request.terminalId,
      "--cols",
      String(request.columns),
      "--rows",
      String(request.rows),
    ];
    this.child = spawn(request.executable, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.child.on("close", (code, signal) => {
      this.closed = true;
      this.resolveProcessExited();
      if (this.stopPromise === undefined) {
        this.fail(new Error(`Herdr Pane observer exited unexpectedly (code=${code}, signal=${signal})`));
      }
    });
    this.child.on("error", (error) => this.fail(new Error(`Herdr Pane observer process error: ${error.message}`)));
    this.child.stdout.on("data", (chunk: Buffer) => this.consumeStdout(chunk));
    this.child.stdout.on("end", () => this.finishStdout());
    this.child.stdout.on("error", (error) =>
      this.fail(new Error(`Herdr Pane observer stdout error: ${error.message}`)),
    );
    this.child.stderr.on("data", (chunk: Buffer) => this.logStderr(this.stderrDecoder.write(chunk)));
    this.child.stderr.on("end", () => this.logStderr(this.stderrDecoder.end()));
    this.child.stderr.on("error", (error) =>
      this.fail(new Error(`Herdr Pane observer stderr error: ${error.message}`)),
    );
    this.child.stdin.on("error", (error) => this.fail(new Error(`Herdr Pane observer stdin error: ${error.message}`)));
  }

  stop(): Promise<void> {
    return this.stopPromise ?? this.startStop();
  }

  private consumeStdout(chunk: Buffer): void {
    if (this.muted) return;

    const lines = `${this.stdoutRemainder}${this.stdoutDecoder.write(chunk)}`.split("\n");
    this.stdoutRemainder = lines.pop() ?? "";
    lines.forEach((line) => {
      if (!this.muted && line.trim()) this.consumeRecord(line.trim());
    });
  }

  private finishStdout(): void {
    if (this.muted) return;

    const trailing = `${this.stdoutRemainder}${this.stdoutDecoder.end()}`.trim();
    this.stdoutRemainder = "";
    if (trailing) this.consumeRecord(trailing);
  }

  private consumeRecord(line: string): void {
    let record: unknown;
    try {
      record = JSON.parse(line) as unknown;
    } catch {
      this.fail(new Error(`Malformed Herdr observer NDJSON: ${line}`));
      return;
    }

    if (!isRecord(record)) {
      this.logger.info(`Ignored unknown Herdr observer record: ${line}`);
      return;
    }

    if (record.type === "terminal.frame") {
      if (typeof record.bytes !== "string" || typeof record.full !== "boolean") {
        this.fail(new Error(`Malformed Herdr terminal.frame record: ${line}`));
        return;
      }

      const decoded = this.frameDecoder.write(Buffer.from(record.bytes, "base64"));
      if (record.full) this.sink.replace(decoded);
      else this.sink.append(decoded);
      return;
    }

    if (record.type === "terminal.closed") {
      const reason = typeof record.reason === "string" ? `: ${record.reason}` : "";
      this.fail(new Error(`Herdr Pane observer reported terminal.closed${reason}`));
      return;
    }

    if (record.type !== "subscription_started") {
      this.logger.info(`Ignored unknown Herdr observer record type: ${String(record.type)}`);
    }
  }

  private logStderr(text: string): void {
    const diagnostic = text.trim();
    if (diagnostic) this.logger.error(`Herdr Pane observer stderr: ${diagnostic}`);
  }

  private fail(error: Error): void {
    if (this.stopPromise !== undefined) return;

    this.muted = true;
    this.logger.error(error.message, error);
    void this.startStop();
  }

  private startStop(): Promise<void> {
    this.muted = true;
    const stopPromise = this.stopChild().catch((error: unknown) =>
      this.logger.error("Herdr Pane observer cleanup failed", error),
    );
    this.stopPromise = stopPromise;
    void stopPromise.then(() => this.resolveCompletion());
    return stopPromise;
  }

  private async stopChild(): Promise<void> {
    this.child.stdin.end();
    if (this.closed) return;

    const exitWasConfirmed = await stopWithEscalation({
      exited: this.processExited,
      signal: (signal) => {
        this.child.kill(signal);
      },
      termWaitMs: SIGTERM_WAIT_MS,
      killWaitMs: SIGKILL_WAIT_MS,
    });
    if (!exitWasConfirmed) {
      this.logger.error("Herdr Pane observer close could not be confirmed after bounded cleanup");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
