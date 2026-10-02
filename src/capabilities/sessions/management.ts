export type RenamePaneRequest = Readonly<{ sessionId: string; paneId: string; label: string | null }>;
export type RenameTabRequest = Readonly<{ sessionId: string; tabId: string; label: string }>;
export type RenameSpaceRequest = Readonly<{ sessionId: string; spaceId: string; label: string }>;
export type ClosePaneRequest = Readonly<{ sessionId: string; paneId: string }>;
export type CloseTabRequest = Readonly<{ sessionId: string; tabId: string }>;
export type CloseSpaceRequest = Readonly<{ sessionId: string; spaceId: string; closeGroup: boolean }>;

export interface ActiveSessionManagement {
  renamePane(request: RenamePaneRequest): Promise<void>;
  renameTab(request: RenameTabRequest): Promise<void>;
  renameSpace(request: RenameSpaceRequest): Promise<void>;
  closePane(request: ClosePaneRequest): Promise<void>;
  closeTab(request: CloseTabRequest): Promise<void>;
  closeSpace(request: CloseSpaceRequest): Promise<void>;
}
