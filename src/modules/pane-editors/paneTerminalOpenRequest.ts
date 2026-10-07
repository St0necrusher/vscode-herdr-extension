import type { HerdrPane } from "@api/herdr";
import type { PaneTerminalOpenRequest } from "./paneTerminalOpening";

export function paneTerminalOpenRequest(sessionId: string, pane: HerdrPane, name: string): PaneTerminalOpenRequest {
  return {
    sessionId,
    paneId: pane.id,
    terminalId: pane.terminalId,
    name,
  };
}
