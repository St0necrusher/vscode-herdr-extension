import { execFile } from "node:child_process";
import { chmodSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server, type Socket } from "node:net";
import type { HerdrExecutableSource } from "../shared";
import type { Logger } from "@core/logger";
import { TAKEOVER_PLUGIN_ID } from "./TakeoverPluginRegistration";

const HELLO_TIMEOUT_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 1_000;
const REOPEN_DELAYS_MS = [1_000, 2_000, 4_000, 8_000];
const SOCKET_MODE = 0o600;

export interface TakeoverOffers {
  offer(request: Readonly<{ sessionId: string; paneId: string; onConfirm(): void }>): TakeoverOffer;
}

export interface TakeoverOffer {
  retract(): void;
}

interface TakeoverPluginRegistrationState {
  isRegistered(): boolean;
}

interface ActiveTakeoverOffer {
  readonly sessionId: string;
  readonly paneId: string;
  readonly token: string;
  readonly onConfirm: () => void;
}

interface OpeningOfferState {
  readonly kind: "opening";
  readonly offer: ActiveTakeoverOffer;
  readonly attempt: number;
  readonly helloTimeout: ReturnType<typeof setTimeout>;
}

interface ShownOfferState {
  readonly kind: "shown";
  readonly offer: ActiveTakeoverOffer;
  readonly attempt: number;
  readonly connection: Socket;
  readonly heartbeat: ReturnType<typeof setInterval>;
}

interface WaitingToReopenOfferState {
  readonly kind: "waiting-to-reopen";
  readonly offer: ActiveTakeoverOffer;
  readonly nextAttempt: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

type TakeoverOfferState = OpeningOfferState | ShownOfferState | WaitingToReopenOfferState;
type RetryableOfferState = OpeningOfferState | ShownOfferState;

export class TakeoverPopupHost implements TakeoverOffers {
  private state: TakeoverOfferState | undefined;
  private ownerSocket: Promise<string> | undefined;
  private server: Server | undefined;
  private socketPath: string | undefined;
  private disposed = false;

  constructor(
    private readonly configuration: HerdrExecutableSource,
    private readonly registration: TakeoverPluginRegistrationState,
    private readonly logger: Logger,
  ) {}

  offer(request: Readonly<{ sessionId: string; paneId: string; onConfirm(): void }>): TakeoverOffer {
    const currentState = this.state;
    if (currentState !== undefined) this.retractState(currentState);
    if (!this.registration.isRegistered()) return inertOffer();

    const offer: ActiveTakeoverOffer = {
      ...request,
      token: randomBytes(32).toString("hex"),
    };
    this.startAttempt(offer, 1);

    return {
      retract: () => {
        const state = this.state;
        if (state?.offer === offer) this.retractState(state);
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const currentState = this.state;
    if (currentState !== undefined) this.retractState(currentState);
    if (this.server !== undefined) this.server.close();
    if (this.socketPath !== undefined) rmSync(this.socketPath, { force: true });
  }

  private startAttempt(offer: ActiveTakeoverOffer, attempt: number): void {
    const state: OpeningOfferState = {
      kind: "opening",
      offer,
      attempt,
      helloTimeout: setTimeout(() => {
        if (this.state === state) this.retryOffer(state, "did not connect within 5 seconds");
      }, HELLO_TIMEOUT_MS),
    };
    this.state = state;
    void this.openPopup(state);
  }

  private async openPopup(state: OpeningOfferState): Promise<void> {
    try {
      const socketPath = await this.ensureOwnerSocket();
      if (this.state !== state) return;

      const sessionArgs = state.offer.sessionId === "default" ? [] : ["--session", state.offer.sessionId];
      const args = [
        ...sessionArgs,
        "plugin",
        "pane",
        "open",
        "--plugin",
        TAKEOVER_PLUGIN_ID,
        "--entrypoint",
        "takeover",
        "--env",
        `HERDR_VSCODE_TAKEOVER_SOCKET=${socketPath}`,
        "--env",
        `HERDR_VSCODE_TAKEOVER_TOKEN=${state.offer.token}`,
        "--env",
        `HERDR_VSCODE_TAKEOVER_PANE=${state.offer.paneId}`,
      ];
      execFile(this.configuration.read().executable, args, (error, stdout, stderr) => {
        if (this.state !== state) return;
        if (error !== null) {
          if (isPluginNotFoundResponse(`${stdout}${stderr}`)) this.finishMissingPluginOffer(state);
          else this.retryOffer(state, error.message, error);
        }
      });
    } catch (error) {
      if (this.state === state) this.retryOffer(state, errorMessage(error), error);
    }
  }

  private ensureOwnerSocket(): Promise<string> {
    this.ownerSocket ??= this.listen();
    return this.ownerSocket;
  }

  private async listen(): Promise<string> {
    const socketPath = join(tmpdir(), `herdr-takeover-${randomBytes(8).toString("hex")}.sock`);
    const server = createServer((connection) => this.acceptConnection(connection));
    this.server = server;
    this.socketPath = socketPath;

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    chmodSync(socketPath, SOCKET_MODE);
    return socketPath;
  }

  private acceptConnection(connection: Socket): void {
    connection.on("error", () => connection.destroy());

    let remainder = "";
    connection.on("data", (chunk: Buffer) => {
      const lines = `${remainder}${chunk.toString("utf8")}`.split("\n");
      remainder = lines.pop() ?? "";
      lines.forEach((line) => {
        if (line.length > 0) this.handleMessage(connection, line);
      });
    });
  }

  private handleMessage(connection: Socket, message: string): void {
    if (message.startsWith("hello ")) {
      const state = this.state;
      const token = message.slice("hello ".length);
      if (state?.offer.token === token) this.showOffer(state, connection);
      else retractAndClose(connection);
      return;
    }

    if (message === "confirm") {
      const state = this.state;
      const connectionOwnsCurrentOffer = state?.kind === "shown" && state.connection === connection;
      if (connectionOwnsCurrentOffer) {
        this.cancelStateTimer(state);
        this.state = undefined;
        connection.end(() => connection.destroy());
        state.offer.onConfirm();
      } else {
        connection.destroy();
      }
    }
  }

  private showOffer(previousState: TakeoverOfferState, connection: Socket): void {
    this.cancelStateTimer(previousState);
    const offer = previousState.offer;
    const attempt = previousState.kind === "waiting-to-reopen" ? previousState.nextAttempt : previousState.attempt;
    const heartbeat = setInterval(() => connection.write("alive\n"), HEARTBEAT_INTERVAL_MS);
    const state: ShownOfferState = { kind: "shown", offer, attempt, connection, heartbeat };
    this.state = state;
    connection.once("close", () => {
      if (this.state === state) this.retryOffer(state, "popup connection closed without confirmation");
    });

    const previousConnection = previousState.kind === "shown" ? previousState.connection : undefined;
    const previousConnectionIsDifferent = previousConnection !== undefined && previousConnection !== connection;
    // A late popup from a timed-out attempt can hello after a newer attempt began.
    if (previousConnectionIsDifferent) retractAndClose(previousConnection);
  }

  private finishMissingPluginOffer(state: OpeningOfferState): void {
    if (this.state !== state) return;

    this.cancelStateTimer(state);
    this.state = undefined;
    this.logger.info(
      `The Herdr takeover plugin is no longer registered; ending the offer for Pane "${state.offer.paneId}" in Session "${state.offer.sessionId}".`,
    );
  }

  private retryOffer(state: RetryableOfferState, reason: string, error?: unknown): void {
    if (this.state !== state) return;

    this.cancelStateTimer(state);
    const failedAttempt = state.attempt;
    const delay = REOPEN_DELAYS_MS[failedAttempt - 1];
    if (delay === undefined) {
      this.state = undefined;
      this.logger.error(
        `Herdr takeover popup failed for Pane "${state.offer.paneId}" in Session "${state.offer.sessionId}": ${reason}; giving up for this offer.`,
        error,
      );
      return;
    }

    const nextAttempt = failedAttempt + 1;
    const timer = setTimeout(() => this.startAttempt(state.offer, nextAttempt), delay);
    this.state = { kind: "waiting-to-reopen", offer: state.offer, nextAttempt, timer };
    this.logger.error(
      `Herdr takeover popup failed for Pane "${state.offer.paneId}" in Session "${state.offer.sessionId}": ${reason}; reopening in ${delay / 1_000} second(s).`,
      error,
    );
  }

  private retractState(state: TakeoverOfferState): void {
    this.cancelStateTimer(state);
    this.state = undefined;
    if (state.kind === "shown") retractAndClose(state.connection);
  }

  private cancelStateTimer(state: TakeoverOfferState): void {
    if (state.kind === "opening") clearTimeout(state.helloTimeout);
    else if (state.kind === "shown") clearInterval(state.heartbeat);
    else clearTimeout(state.timer);
  }
}

function inertOffer(): TakeoverOffer {
  return { retract: () => undefined };
}

function retractAndClose(connection: Socket): void {
  connection.end("retract\n", () => connection.destroy());
}

function isPluginNotFoundResponse(output: string): boolean {
  return /"code"\s*:\s*"plugin_not_found"/.test(output);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
