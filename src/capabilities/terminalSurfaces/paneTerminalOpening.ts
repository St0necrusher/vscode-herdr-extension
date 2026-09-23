export type PaneTerminalOpenRequest = Readonly<{
  sessionId: string;
  paneId: string;
  terminalId: string;
  name: string;
}>;

export interface PaneTerminalOpening {
  openPane(request: PaneTerminalOpenRequest): void;
}
