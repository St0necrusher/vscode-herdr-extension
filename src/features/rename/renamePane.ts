import * as vscode from "vscode";
import type { HerdrPane } from "@api/herdr";
import type { ActiveSessionManagement } from "@modules/sessions";
import type { NavigationContextSource, NavigationContextState } from "@modules/workspace-context";

export async function renamePane(
  context: NavigationContextSource,
  management: ActiveSessionManagement,
  paneId: string,
): Promise<void> {
  const initialState = context.getState();
  if (initialState.kind !== "connected") return;
  const initialPane = selectedPane(initialState, paneId);
  if (initialPane === undefined) return;

  const name = await vscode.window.showInputBox({ title: "Rename Pane", value: initialPane.label ?? "" });
  if (name === undefined) return;

  const label = name.trim().length === 0 ? null : name;
  try {
    await management.renamePane({ sessionId: initialState.sessionId, paneId: initialPane.id, label });
  } catch (error) {
    showError(`Could not rename Pane: ${errorMessage(error)}`);
  }
}

function selectedPane(
  state: Extract<NavigationContextState, { kind: "connected" }>,
  paneId: string,
): HerdrPane | undefined {
  const selectedSpaceId = state.selectedSpaceId;
  if (selectedSpaceId === undefined) return undefined;
  const space = state.snapshot.spaces.find((candidate) => candidate.id === selectedSpaceId);
  if (space === undefined) return undefined;
  return state.snapshot.panes.find((candidate) => {
    const isSelectedPane = candidate.id === paneId && candidate.spaceId === space.id;
    return isSelectedPane;
  });
}

function showError(message: string): void {
  void vscode.window.showErrorMessage(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
