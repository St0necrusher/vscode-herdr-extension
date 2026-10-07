import * as vscode from "vscode";
import type { ActiveSessionCreation } from "@modules/sessions";
import type { PaneTerminalOpening } from "@modules/pane-editors";
import type { NavigationContextSource } from "@modules/workspace-context";
import { createPane } from "./createPane";
import { splitPane } from "./splitPane";

export class CreatePaneFeature implements vscode.Disposable {
  private readonly commands: vscode.Disposable;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly creation: ActiveSessionCreation,
    private readonly paneTerminalOpening: PaneTerminalOpening,
  ) {
    this.commands = vscode.Disposable.from(
      vscode.commands.registerCommand("herdr.createPane", () =>
        createPane(this.context, this.creation, this.paneTerminalOpening),
      ),
      vscode.commands.registerCommand("herdr.splitPaneRight", async (item: unknown) => {
        const paneId = paneIdArgument(item);
        if (paneId !== undefined)
          await splitPane(this.context, this.creation, this.paneTerminalOpening, paneId, "right");
      }),
      vscode.commands.registerCommand("herdr.splitPaneDown", async (item: unknown) => {
        const paneId = paneIdArgument(item);
        if (paneId !== undefined)
          await splitPane(this.context, this.creation, this.paneTerminalOpening, paneId, "down");
      }),
    );
  }

  dispose(): void {
    this.commands.dispose();
  }
}

function paneIdArgument(argument: unknown): string | undefined {
  if (!isRecord(argument)) return undefined;
  return typeof argument.paneId === "string" ? argument.paneId : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  const isObject = typeof value === "object" && value !== null;
  return isObject;
}
