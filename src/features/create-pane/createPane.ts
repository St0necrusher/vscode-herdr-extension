import * as vscode from "vscode";
import { errorMessage } from "@core/errors";
import type { ActiveSessionCreation } from "@modules/sessions";
import type { PaneTerminalOpening } from "@modules/pane-editors";
import type { NavigationContextSource } from "@modules/workspace-context";
import { createAndOpenPane } from "./shared";

export async function createPane(
  context: NavigationContextSource,
  creation: ActiveSessionCreation,
  paneTerminalOpening: PaneTerminalOpening,
): Promise<void> {
  const state = context.getState();
  if (state.kind !== "connected") return;

  const spaceId = state.selectedSpaceId;
  if (spaceId === undefined) return;
  const space = state.snapshot.spaces.find((candidate) => candidate.id === spaceId);
  if (space === undefined) return;

  await createAndOpenPane(
    context,
    paneTerminalOpening,
    creation.createPane({ sessionId: state.sessionId, spaceId: space.id }),
    (error) => void vscode.window.showErrorMessage(`Could not create Pane: ${errorMessage(error)}`),
  );
}
