import * as vscode from "vscode";
import { errorMessage } from "@core/errors";
import { worktreeGroup, type ActiveSessionManagement } from "@modules/sessions";
import type { PaneTerminalClosing } from "@modules/pane-editors";
import type { NavigationContextSource } from "@modules/workspace-context";

export async function closeGroup(
  context: NavigationContextSource,
  management: ActiveSessionManagement,
  paneClosing: PaneTerminalClosing,
  spaceId: string,
): Promise<void> {
  const initialState = context.getState();
  if (initialState.kind !== "connected") return;
  const initialSpace = initialState.snapshot.spaces.find((candidate) => candidate.id === spaceId);
  if (initialSpace === undefined) return;
  const initialMembers = worktreeGroup(initialSpace, initialState.snapshot.spaces);
  if (initialMembers === undefined) return;

  const memberLabels = initialMembers.map((space) => `• ${space.label}`).join("\n");
  const closedSpaceIds = new Set(initialMembers.map((space) => space.id));
  const paneIds = initialState.snapshot.panes.filter((pane) => closedSpaceIds.has(pane.spaceId)).map((pane) => pane.id);
  const action = await vscode.window.showWarningMessage(
    `Close Group "${initialSpace.label}"?`,
    { modal: true, detail: `This will close every Space in the group:\n${memberLabels}` },
    "Close Group",
  );
  if (action !== "Close Group") return;

  try {
    await management.closeSpace({ sessionId: initialState.sessionId, spaceId: initialSpace.id, closeGroup: true });
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not close Group: ${errorMessage(error)}`);
    return;
  }

  paneClosing.closePanes(initialState.sessionId, paneIds);
}
