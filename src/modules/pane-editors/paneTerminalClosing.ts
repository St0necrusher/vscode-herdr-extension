export interface PaneTerminalClosing {
  closePanes(sessionId: string, paneIds: readonly string[]): void;
}
