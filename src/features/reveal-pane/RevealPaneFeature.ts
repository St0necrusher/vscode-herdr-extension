import * as vscode from "vscode";
import { paneName } from "@modules/sessions";
import { paneTerminalOpenRequest, type PaneTerminalOpening } from "@modules/pane-editors";
import type { NavigationContextSource, SpaceSelectionOperations } from "@modules/workspace-context";

export class RevealPaneFeature implements vscode.Disposable {
  private readonly command: vscode.Disposable;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly spaceSelection: SpaceSelectionOperations,
    private readonly paneTerminalOpening: PaneTerminalOpening,
  ) {
    this.command = vscode.commands.registerCommand("herdr.openAgentPane", (paneId: unknown) => {
      if (typeof paneId === "string") this.openAgentPane(paneId);
    });
  }

  dispose(): void {
    this.command.dispose();
  }

  // Navigation only: nothing about the Agent is sent to Herdr, and Herdr focus never changes.
  private openAgentPane(paneId: string): void {
    const state = this.context.getState();
    if (state.kind === "unavailable") return;
    const pane = state.snapshot.panes.find((candidate) => candidate.id === paneId);
    if (pane === undefined) return;

    this.spaceSelection.selectSpace(pane.spaceId);
    this.paneTerminalOpening.openPane(paneTerminalOpenRequest(state.sessionId, pane, paneName(pane)));
  }
}
