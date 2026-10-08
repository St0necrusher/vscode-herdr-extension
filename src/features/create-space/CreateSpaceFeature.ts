import * as vscode from "vscode";
import { errorMessage } from "@core/errors";
import type { CreatedSpace } from "@api/herdr";
import { paneName, type ActiveSessionCreation } from "@modules/sessions";
import { paneTerminalOpenRequest, type PaneTerminalOpening } from "@modules/pane-editors";
import type { NavigationContextSource, SpaceSelectionOperations } from "@modules/workspace-context";

export class CreateSpaceFeature implements vscode.Disposable {
  private readonly command: vscode.Disposable;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly operations: SpaceSelectionOperations,
    private readonly creation: ActiveSessionCreation,
    private readonly paneTerminalOpening: PaneTerminalOpening,
  ) {
    this.command = vscode.commands.registerCommand("herdr.createSpace", () => this.createSpace());
  }

  dispose(): void {
    this.command.dispose();
  }

  private async createSpace(): Promise<void> {
    const initialState = this.context.getState();
    if (initialState.kind !== "connected") return;

    const cwd = await this.chooseSpaceFolder();
    if (cwd === undefined) return;

    let created: CreatedSpace;
    try {
      created = await this.creation.createSpace({ sessionId: initialState.sessionId, cwd });
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not create Space: ${errorMessage(error)}`);
      return;
    }

    this.operations.selectSpace(created.spaceId);
    try {
      this.openPane(created.paneId);
    } catch (error) {
      void vscode.window.showErrorMessage(`Space was created but its Pane could not be opened: ${errorMessage(error)}`);
    }
  }

  private async chooseSpaceFolder(): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length === 0) {
      void vscode.window.showErrorMessage("Open a folder to create a Herdr Space.");
      return undefined;
    }
    if (workspaceFolders.length === 1) return workspaceFolders[0]?.uri.fsPath;

    const selected = await vscode.window.showWorkspaceFolderPick({
      placeHolder: "Choose a folder for the new Herdr Space",
    });
    return selected?.uri.fsPath;
  }

  private openPane(paneId: string): void {
    const state = this.context.getState();
    if (state.kind === "unavailable") throw new Error(`Pane ${paneId} is not in the current Session snapshot`);

    const pane = state.snapshot.panes.find((candidate) => candidate.id === paneId);
    if (pane === undefined) throw new Error(`Pane ${paneId} is not in the current Session snapshot`);
    this.paneTerminalOpening.openPane(paneTerminalOpenRequest(state.sessionId, pane, paneName(pane)));
  }
}
