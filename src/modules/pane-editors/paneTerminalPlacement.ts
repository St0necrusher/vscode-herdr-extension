import type { PaneTerminalOpenRequest } from "./paneTerminalOpening";

export interface PaneTerminalPlacement {
  // Close misplaced/surplus editors and Tab Projection members outside requests before layout:
  // VS Code orphans terminal editors merged while hidden.
  closeDisplacedPanes(requests: readonly PaneTerminalOpenRequest[]): Promise<void>;
  // requests[i] belongs in viewColumn i + 1; the grid already has requests.length groups.
  // Created Pane Editors join the Tab Projection; existing ones keep their membership.
  placePanes(requests: readonly PaneTerminalOpenRequest[]): Promise<void>;
  focusPane(sessionId: string, paneId: string): Promise<void>;
}
