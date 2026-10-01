export type SplitDirection = "right" | "down";

export type CreatedSpace = Readonly<{ spaceId: string; paneId: string }>;
export type CreatedPane = Readonly<{ paneId: string }>;

export type CreateSpaceRequest = Readonly<{ sessionId: string; cwd: string }>;
export type CreatePaneRequest = Readonly<{ sessionId: string; spaceId: string }>;
export type SplitPaneRequest = Readonly<{ sessionId: string; paneId: string; direction: SplitDirection }>;

export interface ActiveSessionCreation {
  createSpace(request: CreateSpaceRequest): Promise<CreatedSpace>;
  createPane(request: CreatePaneRequest): Promise<CreatedPane>;
  splitPane(request: SplitPaneRequest): Promise<CreatedPane>;
}
