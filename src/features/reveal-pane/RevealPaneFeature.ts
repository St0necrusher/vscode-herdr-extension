import * as vscode from "vscode";
import { errorMessage } from "@core/errors";
import { paneName } from "@modules/sessions";
import { paneTerminalOpenRequest, type PaneEditorNavigation } from "@modules/pane-editors";
import type { NavigationContextSource, SpaceSelectionOperations } from "@modules/workspace-context";

export class RevealPaneFeature implements vscode.Disposable {
  private readonly command: vscode.Disposable;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly spaceSelection: SpaceSelectionOperations,
    private readonly paneEditorNavigation: PaneEditorNavigation,
  ) {
    this.command = vscode.commands.registerCommand("herdr.openAgentPane", async (paneId: unknown) => {
      if (typeof paneId === "string") {
        try {
          await this.openAgentPane(paneId);
        } catch (error) {
          void vscode.window.showErrorMessage(`Could not open Pane: ${errorMessage(error)}`);
        }
      }
    });
  }

  dispose(): void {
    this.command.dispose();
  }

  // Navigation only: nothing about the Agent is sent to Herdr, and Herdr focus never changes.
  private async openAgentPane(paneId: string): Promise<void> {
    const state = this.context.getState();
    if (state.kind === "unavailable") return;
    const pane = state.snapshot.panes.find((candidate) => candidate.id === paneId);
    if (pane === undefined) return;

    this.spaceSelection.selectSpace(pane.spaceId);
    await this.paneEditorNavigation.navigateToPane(paneTerminalOpenRequest(state.sessionId, pane, paneName(pane)));
  }
}
