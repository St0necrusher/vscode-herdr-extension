import * as vscode from "vscode";
import type { ActiveSessionManagement } from "@modules/sessions";
import type { PaneTerminalClosing } from "@modules/pane-editors";
import type { NavigationContextSource } from "@modules/workspace-context";

export async function closeSpace(
  context: NavigationContextSource,
  management: ActiveSessionManagement,
  paneClosing: PaneTerminalClosing,
  spaceId: string,
): Promise<void> {
  const initialState = context.getState();
  if (initialState.kind !== "connected") return;
  const initialSpace = initialState.snapshot.spaces.find((candidate) => candidate.id === spaceId);
  if (initialSpace === undefined) return;

  const paneIds = initialState.snapshot.panes.filter((pane) => pane.spaceId === initialSpace.id).map((pane) => pane.id);
  const action = await vscode.window.showWarningMessage(
    `Close Space "${initialSpace.label}"?`,
    { modal: true, detail: "Every Tab and Pane in this Space will be closed." },
    "Close Space",
  );
  if (action !== "Close Space") return;

  try {
    await management.closeSpace({ sessionId: initialState.sessionId, spaceId: initialSpace.id, closeGroup: false });
  } catch (error) {
    showError(`Could not close Space: ${errorMessage(error)}`);
    return;
  }

  paneClosing.closePanes(initialState.sessionId, paneIds);
}

function showError(message: string): void {
  void vscode.window.showErrorMessage(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
