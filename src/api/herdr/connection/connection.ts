import type {
  HerdrSessionSnapshot,
  HerdrResolvedSession,
  HerdrSessionMetadata,
  HerdrPaneMovedEvent,
  CreatedPane,
  CreatedSpace,
  SplitDirection,
  HerdrConnectionFailure,
} from "../shared";

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
