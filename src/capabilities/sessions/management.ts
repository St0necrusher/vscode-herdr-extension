export type RenamePaneRequest = Readonly<{ sessionId: string; paneId: string; label: string | null }>;
export type RenameTabRequest = Readonly<{ sessionId: string; tabId: string; label: string }>;
// insertIndex is Herdr's gap index in the Space's Tab order before the move: 0 is first, the Tab count is last.
export type MoveTabRequest = Readonly<{ sessionId: string; tabId: string; insertIndex: number }>;
export type RenameSpaceRequest = Readonly<{ sessionId: string; spaceId: string; label: string }>;
export type ClosePaneRequest = Readonly<{ sessionId: string; paneId: string }>;
export type CloseTabRequest = Readonly<{ sessionId: string; tabId: string }>;
export type CloseSpaceRequest = Readonly<{ sessionId: string; spaceId: string; closeGroup: boolean }>;

export interface ActiveSessionManagement {
  renamePane(request: RenamePaneRequest): Promise<void>;
  renameTab(request: RenameTabRequest): Promise<void>;
  moveTab(request: MoveTabRequest): Promise<void>;
  renameSpace(request: RenameSpaceRequest): Promise<void>;
  closePane(request: ClosePaneRequest): Promise<void>;
  closeTab(request: CloseTabRequest): Promise<void>;
  closeSpace(request: CloseSpaceRequest): Promise<void>;
}
