import * as vscode from "vscode";
import type { ActiveSessionManagement } from "@modules/sessions";
import type { NavigationContextSource } from "@modules/workspace-context";

export async function renameSpace(
  context: NavigationContextSource,
  management: ActiveSessionManagement,
  spaceId: string,
): Promise<void> {
  const initialState = context.getState();
  if (initialState.kind !== "connected") return;
  const initialSpace = initialState.snapshot.spaces.find((candidate) => candidate.id === spaceId);
  if (initialSpace === undefined) return;

  const label = await vscode.window.showInputBox({
    title: "Rename Space",
    value: initialSpace.label,
    validateInput: (value) => (value.trim().length === 0 ? "Space name cannot be empty." : undefined),
  });
  if (label === undefined) return;

  try {
    await management.renameSpace({ sessionId: initialState.sessionId, spaceId: initialSpace.id, label });
  } catch (error) {
    showError(`Could not rename Space: ${errorMessage(error)}`);
  }
}

function showError(message: string): void {
  void vscode.window.showErrorMessage(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
