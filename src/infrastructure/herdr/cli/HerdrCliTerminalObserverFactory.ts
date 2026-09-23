import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { HerdrLogger } from "@capabilities/runtime";
import type {
  HerdrTerminalObserverAttempt,
  HerdrTerminalObserverEvent,
  HerdrTerminalObserverFactory,
  HerdrTerminalObserverRequest,
} from "@capabilities/terminalSurfaces";

type ObserverProcess = ChildProcessByStdio<null, Readable, Readable>;

export class HerdrCliTerminalObserverFactory implements HerdrTerminalObserverFactory {
  constructor(private readonly logger: HerdrLogger) {}

  start(
    request: HerdrTerminalObserverRequest,
    listener: (event: HerdrTerminalObserverEvent) => void,
  ): HerdrTerminalObserverAttempt {
    const child = spawn(request.executable, observerArgs(request), {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    return new HerdrCliTerminalObserverAttempt(child, request, listener, this.logger);
  }
}

class HerdrCliTerminalObserverAttempt implements HerdrTerminalObserverAttempt {
  private readonly stdoutDecoder = new StringDecoder("utf8");
  private readonly ansiDecoder = new StringDecoder("utf8");
  private readonly stderrDecoder = new StringDecoder("utf8");
  private stdoutRemainder = "";
  private stderrRemainder = "";
  private disposed = false;
  private finished = false;

  constructor(
    private readonly child: ObserverProcess,
    private readonly request: HerdrTerminalObserverRequest,
    private readonly listener: (event: HerdrTerminalObserverEvent) => void,
    private readonly logger: HerdrLogger,
  ) {
    child.stdout.on("data", (chunk: Buffer) => this.consumeStdout(chunk));
    child.stdout.on("error", (error: Error) => this.finish({ kind: "transport-lost", diagnostic: error.message }));
    child.stderr.on("data", (chunk: Buffer) => this.consumeStderr(chunk));
    child.stderr.on("error", (error: Error) => this.logger.error("Herdr terminal observer stderr failed.", error));
    child.on("error", (error) => this.finish({ kind: "transport-lost", diagnostic: error.message }));
    child.on("close", (code, signal) => this.handleClose(code, signal));
    this.logger.info(
      `Started read-only Herdr terminal observer for Session "${request.sessionId}" terminal "${request.terminalId}".`,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.finished = true;
    this.child.kill();
  }

  private consumeStdout(chunk: Buffer): void {
    if (this.finished) return;
    this.stdoutRemainder += this.stdoutDecoder.write(chunk);
    this.consumeLines();
  }

  private consumeLines(): void {
    while (!this.finished) {
      const newline = this.stdoutRemainder.indexOf("\n");
      if (newline < 0) return;
      const line = this.stdoutRemainder.slice(0, newline).trim();
      this.stdoutRemainder = this.stdoutRemainder.slice(newline + 1);
      if (line.length > 0) this.consumeRecord(line);
    }
  }

  private consumeRecord(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch (error) {
      this.finish({
        kind: "fault",
        diagnostic: `Invalid Herdr terminal observer JSON: ${errorMessage(error)}.`,
      });
      return;
    }

    if (!isRecord(value) || typeof value.type !== "string") {
      this.logger.info("Ignored an unknown Herdr terminal observer record.");
      return;
    }
    if (value.type === "terminal.frame") {
      if (typeof value.bytes !== "string" || typeof value.full !== "boolean" || !isBase64(value.bytes)) {
        this.finish({ kind: "fault", diagnostic: "Invalid Herdr terminal.frame record." });
        return;
      }
      const ansi = this.ansiDecoder.write(Buffer.from(value.bytes, "base64"));
      this.listener({ kind: "frame", ansi, full: value.full });
      return;
    }
    if (value.type === "terminal.closed") {
      if (value.reason !== undefined && typeof value.reason !== "string") {
        this.finish({ kind: "fault", diagnostic: "Invalid Herdr terminal.closed record." });
        return;
      }
      const event: HerdrTerminalObserverEvent =
        value.reason === undefined ? { kind: "closed" } : { kind: "closed", reason: value.reason };
      this.logger.info(
        `Herdr terminal observer stream closed${value.reason === undefined ? "." : `: ${value.reason}`}`,
      );
      this.finish(event);
      return;
    }
    this.logger.info(`Ignored unknown Herdr terminal observer record type "${value.type}".`);
  }

  private consumeStderr(chunk: Buffer): void {
    if (this.finished) return;
    this.stderrRemainder += this.stderrDecoder.write(chunk);
    for (;;) {
      const newline = this.stderrRemainder.indexOf("\n");
      if (newline < 0) return;
      const line = this.stderrRemainder.slice(0, newline).trim();
      this.stderrRemainder = this.stderrRemainder.slice(newline + 1);
      if (line.length > 0) this.logger.error(`Herdr terminal observer: ${line}`);
    }
  }

  private handleClose(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.finished || this.disposed) return;
    this.stdoutRemainder += this.stdoutDecoder.end();
    this.consumeLines();
    if (this.isFinished()) return;
    const trailing = this.stdoutRemainder.trim();
    this.stdoutRemainder = "";
    if (trailing.length > 0) this.consumeRecord(trailing);
    if (this.isFinished()) return;

    this.stderrRemainder += this.stderrDecoder.end();
    const stderr = this.stderrRemainder.trim();
    if (stderr.length > 0) this.logger.error(`Herdr terminal observer: ${stderr}`);
    const status = code === null ? `signal ${signal ?? "unknown"}` : `exit code ${code}`;
    this.logger.info(`Herdr terminal observer ended with ${status}.`);
    this.finish({ kind: "transport-lost", diagnostic: `Observer process ended with ${status}.` });
  }

  private isFinished(): boolean {
    return this.finished;
  }

  private finish(event: HerdrTerminalObserverEvent): void {
    if (this.finished) return;
    this.finished = true;
    if (!this.disposed) this.child.kill();
    this.listener(event);
  }
}

function observerArgs(request: HerdrTerminalObserverRequest): string[] {
  const args: string[] = [];
  if (request.sessionId !== "default") args.push("--session", request.sessionId);
  args.push(
    "terminal",
    "session",
    "observe",
    request.terminalId,
    "--cols",
    String(request.columns),
    "--rows",
    String(request.rows),
  );
  return args;
}

function isBase64(value: string): boolean {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) return false;
  if (value.includes("=") && value.length % 4 !== 0) return false;
  const decoded = Buffer.from(value, "base64").toString("base64");
  return decoded.replace(/=+$/, "") === value.replace(/=+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
