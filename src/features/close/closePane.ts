import * as vscode from "vscode";
import { isPaneClosable, type ActiveSessionManagement } from "@modules/sessions";
import type { PaneTerminalClosing } from "@modules/pane-editors";
import type { NavigationContextSource } from "@modules/workspace-context";

export async function closePane(
  context: NavigationContextSource,
  management: ActiveSessionManagement,
  paneClosing: PaneTerminalClosing,
  paneId: string,
): Promise<void> {
  const state = context.getState();
  if (state.kind !== "connected") return;
  const selectedSpaceId = state.selectedSpaceId;
  if (selectedSpaceId === undefined) return;
  const space = state.snapshot.spaces.find((candidate) => candidate.id === selectedSpaceId);
  if (space === undefined) return;

  const panes = state.snapshot.panes.filter((pane) => pane.spaceId === space.id);
  const pane = panes.find((candidate) => candidate.id === paneId);
  if (pane === undefined) return;
  const isClosable = isPaneClosable(panes);
  if (!isClosable) return;

  try {
    await management.closePane({ sessionId: state.sessionId, paneId: pane.id });
  } catch (error) {
    showError(`Could not close Pane: ${errorMessage(error)}`);
    return;
  }

  paneClosing.closePanes(state.sessionId, [pane.id]);
}

function showError(message: string): void {
  void vscode.window.showErrorMessage(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
