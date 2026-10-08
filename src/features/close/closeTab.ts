import * as vscode from "vscode";
import { errorMessage } from "@core/errors";
import { isTabClosable, type ActiveSessionManagement } from "@modules/sessions";
import type { PaneTerminalClosing } from "@modules/pane-editors";
import type { NavigationContextSource } from "@modules/workspace-context";

export async function closeTab(
  context: NavigationContextSource,
  management: ActiveSessionManagement,
  paneClosing: PaneTerminalClosing,
  tabId: string,
): Promise<void> {
  const state = context.getState();
  if (state.kind !== "connected") return;
  const selectedSpaceId = state.selectedSpaceId;
  if (selectedSpaceId === undefined) return;
  const space = state.snapshot.spaces.find((candidate) => candidate.id === selectedSpaceId);
  if (space === undefined) return;

  const tabs = state.snapshot.herdrTabs.filter((tab) => tab.spaceId === space.id);
  const tab = tabs.find((candidate) => candidate.id === tabId);
  if (tab === undefined) return;
  const panes = state.snapshot.panes.filter((pane) => pane.spaceId === space.id);
  const tabPanes = panes.filter((pane) => pane.herdrTabId === tab.id);
  const isGroup = tabPanes.length > 1;
  if (!isGroup) return;
  const isClosable = isTabClosable(tabs);
  if (!isClosable) return;

  const paneIds = tabPanes.map((pane) => pane.id);
  try {
    await management.closeTab({ sessionId: state.sessionId, tabId: tab.id });
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not close Tab: ${errorMessage(error)}`);
    return;
  }

  paneClosing.closePanes(state.sessionId, paneIds);
}
