import * as vscode from "vscode";
import type { HerdrTab } from "@api/herdr";
import type { ActiveSessionManagement } from "@modules/sessions";
import type { NavigationContextSource, NavigationContextState } from "@modules/workspace-context";

export async function renameTab(
  context: NavigationContextSource,
  management: ActiveSessionManagement,
  tabId: string,
): Promise<void> {
  const initialState = context.getState();
  if (initialState.kind !== "connected") return;
  const initialTab = selectedTab(initialState, tabId);
  if (initialTab === undefined) return;

  const label = await vscode.window.showInputBox({
    title: "Rename Tab",
    value: initialTab.label,
    validateInput: (value) => (value.trim().length === 0 ? "Tab name cannot be empty." : undefined),
  });
  if (label === undefined) return;

  try {
    await management.renameTab({ sessionId: initialState.sessionId, tabId: initialTab.id, label });
  } catch (error) {
    showError(`Could not rename Tab: ${errorMessage(error)}`);
  }
}

function selectedTab(
  state: Extract<NavigationContextState, { kind: "connected" }>,
  tabId: string,
): HerdrTab | undefined {
  const selectedSpaceId = state.selectedSpaceId;
  if (selectedSpaceId === undefined) return undefined;
  const space = state.snapshot.spaces.find((candidate) => candidate.id === selectedSpaceId);
  if (space === undefined) return undefined;
  const tab = state.snapshot.herdrTabs.find((candidate) => {
    const isSelectedTab = candidate.id === tabId && candidate.spaceId === space.id;
    return isSelectedTab;
  });
  if (tab === undefined) return undefined;
  const hasPane = state.snapshot.panes.some((pane) => pane.herdrTabId === tab.id && pane.spaceId === space.id);
  if (!hasPane) return undefined;
  return tab;
}

function showError(message: string): void {
  void vscode.window.showErrorMessage(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
