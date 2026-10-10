export type PaneTerminalOpenRequest = Readonly<{
  sessionId: string;
  paneId: string;
  terminalId: string;
  name: string;
}>;

export interface PaneTerminalOpening {
  openPane(request: PaneTerminalOpenRequest): void;
}

export interface PaneEditorNavigation {
  // A navigation click retires the Tab Projection, then opens the Pane (ADR 0018).
  navigateToPane(request: PaneTerminalOpenRequest): Promise<void>;
}
