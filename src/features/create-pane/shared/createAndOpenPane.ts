import * as vscode from "vscode";
import { errorMessage } from "@core/errors";
import type { CreatedPane } from "@api/herdr";
import { paneName } from "@modules/sessions";
import { paneTerminalOpenRequest, type PaneTerminalOpening } from "@modules/pane-editors";
import type { NavigationContextSource } from "@modules/workspace-context";

export async function createAndOpenPane(
  context: NavigationContextSource,
  paneTerminalOpening: PaneTerminalOpening,
  creation: Promise<CreatedPane>,
  showCreationError: (error: unknown) => void,
): Promise<void> {
  let paneId: string;
  try {
    const created = await creation;
    paneId = created.paneId;
  } catch (error) {
    showCreationError(error);
    return;
  }

  try {
    const state = context.getState();
    if (state.kind === "unavailable") throw new Error(`Pane ${paneId} is not in the current Session snapshot`);

    const pane = state.snapshot.panes.find((candidate) => candidate.id === paneId);
    if (pane === undefined) throw new Error(`Pane ${paneId} is not in the current Session snapshot`);
    paneTerminalOpening.openPane(paneTerminalOpenRequest(state.sessionId, pane, paneName(pane)));
  } catch (error) {
    void vscode.window.showErrorMessage(`Pane was created but could not be opened: ${errorMessage(error)}`);
  }
}
