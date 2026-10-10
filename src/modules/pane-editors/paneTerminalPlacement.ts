import type { PaneTerminalOpenRequest } from "./paneTerminalOpening";

export interface PaneTerminalPlacement {
  // Close before layout: VS Code orphans terminal editors merged while hidden.
  closeDisplacedPanes(requests: readonly PaneTerminalOpenRequest[]): Promise<void>;
  // requests[i] belongs in viewColumn i + 1; the grid already has requests.length groups.
  placePanes(requests: readonly PaneTerminalOpenRequest[]): Promise<void>;
  focusPane(sessionId: string, paneId: string): Promise<void>;
}
