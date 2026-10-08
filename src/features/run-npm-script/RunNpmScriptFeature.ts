import * as vscode from "vscode";
import { errorMessage } from "@core/errors";
import { paneName, type ActiveSessionCreation } from "@modules/sessions";
import { paneTerminalOpenRequest, type PaneTerminalOpenRequest, type PaneTerminalOpening } from "@modules/pane-editors";
import type { NavigationContextSource } from "@modules/workspace-context";
import { npmScriptCommand, packageFolder, type NpmScriptTarget } from "./npmScriptCommand";

export class RunNpmScriptFeature {
  private readonly commands: vscode.Disposable;
  private disposed = false;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly creation: ActiveSessionCreation,
    private readonly paneOpening: PaneTerminalOpening,
  ) {
    this.commands = vscode.Disposable.from(
      vscode.commands.registerCommand("herdr.runNpmScript", async (element: unknown) => {
        const target = npmViewScriptTarget(element);
        if (target === undefined) this.showUnexpectedScriptElementError();
        else await this.runScript(target);
      }),
      vscode.commands.registerCommand("herdr.runNpmScriptFromHover", async (args: unknown) => {
        const target = hoverScriptTarget(args);
        if (target !== undefined) await this.runScript(target);
      }),
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.commands.dispose();
  }

  async runNpmScriptAtCursor(target: NpmScriptTarget | undefined): Promise<void> {
    if (target === undefined) this.showNoScriptAtCursorError();
    else await this.runScript(target);
  }

  private async runScript(target: NpmScriptTarget): Promise<void> {
    const command = await npmScriptCommand(target);

    const state = this.context.getState();
    if (state.kind !== "connected") return;
    if (state.selectedSpaceId === undefined) {
      this.showNoSelectedSpaceError();
      return;
    }

    let paneId: string;
    try {
      const created = await this.creation.createPane({
        sessionId: state.sessionId,
        spaceId: state.selectedSpaceId,
        cwd: packageFolder(target).fsPath,
        label: target.script,
      });
      paneId = created.paneId;
    } catch (error) {
      this.showScriptTabCreationError(error);
      return;
    }

    // The Tab is kept on failure: closing it would destroy server state the user may want to inspect.
    try {
      await this.creation.runCommand({ sessionId: state.sessionId, paneId, command });
    } catch (error) {
      this.showScriptRunError(error);
      return;
    }

    try {
      this.openPane(paneId);
    } catch (error) {
      this.showScriptPaneOpenError(error);
    }
  }

  private openPane(paneId: string): void {
    const state = this.context.getState();
    let request: PaneTerminalOpenRequest | undefined;
    if (state.kind !== "unavailable") {
      const pane = state.snapshot.panes.find((candidate) => candidate.id === paneId);
      if (pane !== undefined) request = paneTerminalOpenRequest(state.sessionId, pane, paneName(pane));
    }
    if (request === undefined) throw new Error(`Pane ${paneId} is not in the current Session snapshot`);
    this.paneOpening.openPane(request);
  }

  private showNoScriptAtCursorError(): void {
    void vscode.window.showErrorMessage("No npm script at the cursor.");
  }

  private showUnexpectedScriptElementError(): void {
    void vscode.window.showErrorMessage(
      "Could not run the script in Herdr: the NPM Scripts item has an unexpected shape.",
    );
  }

  private showNoSelectedSpaceError(): void {
    void vscode.window.showErrorMessage("Select a Herdr Space to run the script in.");
  }

  private showScriptTabCreationError(error: unknown): void {
    void vscode.window.showErrorMessage(`Could not create a Herdr Tab for the script: ${errorMessage(error)}`);
  }

  private showScriptRunError(error: unknown): void {
    void vscode.window.showErrorMessage(
      `Herdr Tab was created but the script could not be started: ${errorMessage(error)}`,
    );
  }

  private showScriptPaneOpenError(error: unknown): void {
    void vscode.window.showErrorMessage(`Script was started but its Pane could not be opened: ${errorMessage(error)}`);
  }
}

// The element is the npm extension's internal NpmScript tree item, so it can only be duck-typed.
function npmViewScriptTarget(element: unknown): NpmScriptTarget | undefined {
  const script = property(property(property(element, "task"), "definition"), "script");
  const packageJsonUri = property(property(element, "package"), "resourceUri");
  const isNpmScript = typeof script === "string" && packageJsonUri instanceof vscode.Uri;
  if (!isNpmScript) return undefined;
  return { script, packageJsonUri };
}

function hoverScriptTarget(args: unknown): NpmScriptTarget | undefined {
  const script = property(args, "script");
  const documentUri = property(args, "documentUri");
  const isHoverArgs = typeof script === "string" && typeof documentUri === "string";
  if (!isHoverArgs) return undefined;
  return { script, packageJsonUri: vscode.Uri.parse(documentUri) };
}

function property(value: unknown, key: string): unknown {
  const isObject = typeof value === "object" && value !== null;
  return isObject ? (value as Record<string, unknown>)[key] : undefined;
}
