import { StringDecoder } from "node:string_decoder";
import { HerdrConnectionFailureError } from "@capabilities/sessions";
import type { HerdrLogger } from "@capabilities/runtime";
import { herdrError, invalidResponse, type HerdrProtocolRecord } from "./protocol/HerdrProtocol";
import type { HerdrSocketTransport } from "./NodeHerdrSocketConnector";

const maxLineBytes = 8 * 1024 * 1024;

export class JsonSocketClient {
  private readonly transport: HerdrSocketTransport;
  private readonly logger: HerdrLogger;
  private readonly onEvent: (message: HerdrProtocolRecord) => void;
  private readonly onFailure: (error: unknown) => void;
  private readonly requestTimeoutMs: number;
  private readonly decoder = new StringDecoder("utf8");
  private readonly pending = new Map<
    string,
    Readonly<{
      resolve(value: HerdrProtocolRecord): void;
      reject(error: unknown): void;
      timer: ReturnType<typeof setTimeout>;
    }>
  >();
  private readonly subscriptions: { dispose(): void }[];
  private input = "";
  private nextRequestId = 1;
  private failed = false;
  private disposed = false;

  constructor(
    transport: HerdrSocketTransport,
    logger: HerdrLogger,
    onEvent: (message: HerdrProtocolRecord) => void,
    onFailure: (error: unknown) => void,
    requestTimeoutMs: number,
  ) {
    this.transport = transport;
    this.logger = logger;
    this.onEvent = onEvent;
    this.onFailure = onFailure;
    this.requestTimeoutMs = requestTimeoutMs;
    this.subscriptions = [
      transport.onData((data) => this.receive(data)),
      transport.onError((error) => this.fail(error)),
      transport.onClose(() => this.fail(new Error("Herdr socket closed."))),
    ];
  }

  request(method: string, params: Readonly<Record<string, unknown>>): Promise<HerdrProtocolRecord> {
    if (this.disposed) return Promise.reject(new Error("Herdr socket is disposed."));
    if (this.failed) return Promise.reject(new Error("Herdr socket failed."));
    const id = `vscode-herdr:${this.nextRequestId++}`;
    return new Promise<HerdrProtocolRecord>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Herdr request timed out: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.transport.write(`${JSON.stringify({ id, method, params })}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Herdr socket disposed."));
    }
    this.pending.clear();
    for (const subscription of this.subscriptions) subscription.dispose();
    this.transport.dispose();
  }

  private receive(data: Uint8Array): void {
    if (this.disposed) return;
    this.input += this.decoder.write(Buffer.from(data));
    let newline = this.input.indexOf("\n");
    while (newline >= 0) {
      const rawLine = this.input.slice(0, newline);
      this.input = this.input.slice(newline + 1);
      if (Buffer.byteLength(rawLine, "utf8") > maxLineBytes) {
        this.fail(new InvalidSocketMessageError("Herdr response exceeded the maximum line size."));
        return;
      }
      const line = rawLine.trim();
      if (line.length > 0) {
        try {
          const message: unknown = JSON.parse(line);
          this.route(message);
        } catch (error) {
          this.fail(
            error instanceof InvalidSocketMessageError
              ? error
              : new InvalidSocketMessageError("Herdr returned invalid newline-delimited JSON."),
          );
          return;
        }
      }
      newline = this.input.indexOf("\n");
    }
    if (Buffer.byteLength(this.input, "utf8") > maxLineBytes) {
      this.fail(new InvalidSocketMessageError("Herdr response exceeded the maximum line size."));
    }
  }

  private route(value: unknown): void {
    if (!isRecord(value)) throw new InvalidSocketMessageError("Herdr returned a non-object response.");
    if (typeof value.id === "string") {
      const request = this.pending.get(value.id);
      if (request === undefined) {
        this.logger.info(`Ignoring an unknown Herdr response id "${value.id}".`);
        return;
      }
      this.pending.delete(value.id);
      clearTimeout(request.timer);
      if (isRecord(value.error)) {
        request.reject(new HerdrRequestError(value.error));
      } else if (isRecord(value.result)) {
        request.resolve(value.result);
      } else {
        request.reject(new InvalidSocketMessageError("Herdr returned a response without a result or error."));
      }
      return;
    }
    if (typeof value.event === "string" && isRecord(value.data)) {
      this.onEvent(value);
      return;
    }
    throw new InvalidSocketMessageError("Herdr returned an invalid response envelope.");
  }

  private fail(error: unknown): void {
    if (this.disposed || this.failed) return;
    this.failed = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.onFailure(error);
  }
}

class HerdrRequestError extends Error {
  readonly response: HerdrProtocolRecord;

  constructor(response: HerdrProtocolRecord) {
    super(typeof response.message === "string" ? response.message : "Herdr request failed.");
    this.name = "HerdrRequestError";
    this.response = response;
  }
}

class InvalidSocketMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSocketMessageError";
  }
}

function isRecord(value: unknown): value is HerdrProtocolRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asFailure(error: unknown, operation: "ping" | "subscribe" | "snapshot"): HerdrConnectionFailureError {
  if (error instanceof HerdrConnectionFailureError) return error;
  if (error instanceof HerdrRequestError) return herdrError(operation, error.response);
  if (error instanceof InvalidSocketMessageError) return invalidResponse(error.message);
  if (error instanceof Error) return new HerdrConnectionFailureError({ kind: "transport", diagnostic: error.message });
  return new HerdrConnectionFailureError({ kind: "transport", diagnostic: String(error) });
}
