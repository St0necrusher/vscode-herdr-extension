import * as vscode from "vscode";
import { errorMessage } from "@core/errors";
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
    void vscode.window.showErrorMessage(`Could not rename Space: ${errorMessage(error)}`);
  }
}
