import type { HerdrSessionSnapshot } from "./snapshot";
import type { HerdrResolvedSession, HerdrSessionMetadata } from "./session";
import type { HerdrPaneMovedEvent } from "./sessionEvents";
import type { CreatedPane, CreatedSpace, SplitDirection } from "./creation";

export type HerdrConnectionFailure =
  | Readonly<{ kind: "transport"; diagnostic: string }>
  | Readonly<{
      kind: "herdr-error";
      code: string;
      message: string;
      operation: "ping" | "subscribe" | "snapshot";
    }>
  | Readonly<{
      kind: "incompatible";
      diagnostic: string;
      version?: string;
      protocol?: number;
      endpointProtocolGeneration?: number;
    }>
  | Readonly<{ kind: "invalid-response"; diagnostic: string }>;

export class HerdrConnectionFailureError extends Error {
  readonly failure: HerdrConnectionFailure;

  constructor(failure: HerdrConnectionFailure) {
    super(connectionFailureMessage(failure));
    this.name = "HerdrConnectionFailureError";
    this.failure = failure;
  }
}

export interface HerdrSessionProjectionConsumer {
  replaceSnapshot(snapshot: HerdrSessionSnapshot): void;
  connectionClosed(failure: HerdrConnectionFailure): void;
  paneMoved?(event: HerdrPaneMovedEvent): void;
}

export interface HerdrSessionConnection {
  bootstrap(consumer: HerdrSessionProjectionConsumer): Promise<HerdrSessionMetadata>;
  createSpace(cwd: string): Promise<CreatedSpace>;
  createPane(spaceId: string, options?: Readonly<{ cwd?: string; label?: string }>): Promise<CreatedPane>;
  splitPane(paneId: string, direction: SplitDirection): Promise<CreatedPane>;
  runCommand(paneId: string, command: string): Promise<void>;
  renamePane(paneId: string, label: string | null): Promise<void>;
  renameTab(tabId: string, label: string): Promise<void>;
  moveTab(tabId: string, insertIndex: number): Promise<void>;
  renameSpace(spaceId: string, label: string): Promise<void>;
  closePane(paneId: string): Promise<void>;
  closeTab(tabId: string): Promise<void>;
  closeSpace(spaceId: string, closeGroup: boolean): Promise<void>;
  dispose(): void;
}

export interface HerdrSessionConnectionFactory {
  create(session: HerdrResolvedSession): HerdrSessionConnection;
}

function connectionFailureMessage(failure: HerdrConnectionFailure): string {
  switch (failure.kind) {
    case "transport":
    case "incompatible":
    case "invalid-response":
      return failure.diagnostic;
    case "herdr-error":
      return failure.message;
  }
}
