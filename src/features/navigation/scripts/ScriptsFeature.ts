import * as vscode from "vscode";
import type { ActiveSessionCreation } from "@modules/sessions";
import type { NavigationContextSource, NavigationPaneOpening } from "../capabilities";
import { npmScriptCommand, packageFolder, type NpmScriptTarget } from "./npmScriptCommand";
import { hoverScriptTarget, npmViewScriptTarget, VsCodeScriptsView } from "./view";

export class ScriptsFeature {
  private readonly view: VsCodeScriptsView;
  private readonly commands: vscode.Disposable;
  private disposed = false;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly creation: ActiveSessionCreation,
    private readonly paneOpening: NavigationPaneOpening,
  ) {
    this.view = new VsCodeScriptsView(context);
    this.commands = vscode.Disposable.from(
      vscode.commands.registerCommand("herdr.runNpmScript", async (element: unknown) => {
        const target = npmViewScriptTarget(element);
        if (target === undefined) this.view.showUnexpectedScriptElementError();
        else await this.runScript(target);
      }),
      vscode.commands.registerCommand("herdr.runNpmScriptAtCursor", async () => {
        const target = this.view.scriptAtCursor();
        if (target === undefined) this.view.showNoScriptAtCursorError();
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
    this.view.dispose();
  }

  private async runScript(target: NpmScriptTarget): Promise<void> {
    const command = await npmScriptCommand(target);

    const state = this.context.getState();
    if (state.kind !== "connected") return;
    if (state.selectedSpaceId === undefined) {
      this.view.showNoSelectedSpaceError();
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
      this.view.showScriptTabCreationError(error);
      return;
    }

    // The Tab is kept on failure: closing it would destroy server state the user may want to inspect.
    try {
      await this.creation.runCommand({ sessionId: state.sessionId, paneId, command });
    } catch (error) {
      this.view.showScriptRunError(error);
      return;
    }

    try {
      this.paneOpening.openPane(paneId);
    } catch (error) {
      this.view.showScriptPaneOpenError(error);
    }
  }
}
