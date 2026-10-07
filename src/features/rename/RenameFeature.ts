import * as vscode from "vscode";
import type { ActiveSessionManagement } from "@modules/sessions";
import type { NavigationContextSource } from "@modules/workspace-context";
import { renamePane } from "./renamePane";
import { renameSpace } from "./renameSpace";
import { renameTab } from "./renameTab";

export class RenameFeature implements vscode.Disposable {
  private readonly commands: vscode.Disposable;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly management: ActiveSessionManagement,
  ) {
    this.commands = vscode.Disposable.from(
      vscode.commands.registerCommand("herdr.renameSpace", async (item: unknown) => {
        const spaceId = spaceIdArgument(item);
        if (spaceId !== undefined) await renameSpace(this.context, this.management, spaceId);
      }),
      vscode.commands.registerCommand("herdr.renameTab", async (item: unknown) => {
        const tabId = tabIdArgument(item);
        if (tabId !== undefined) await renameTab(this.context, this.management, tabId);
      }),
      vscode.commands.registerCommand("herdr.renamePane", async (item: unknown) => {
        const paneId = paneIdArgument(item);
        if (paneId !== undefined) await renamePane(this.context, this.management, paneId);
      }),
    );
  }

  dispose(): void {
    this.commands.dispose();
  }
}

function spaceIdArgument(argument: unknown): string | undefined {
  if (!isRecord(argument)) return undefined;
  return typeof argument.spaceId === "string" ? argument.spaceId : undefined;
}

function tabIdArgument(argument: unknown): string | undefined {
  if (!isRecord(argument)) return undefined;
  return typeof argument.tabId === "string" ? argument.tabId : undefined;
}

function paneIdArgument(argument: unknown): string | undefined {
  if (!isRecord(argument)) return undefined;
  return typeof argument.paneId === "string" ? argument.paneId : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  const isObject = typeof value === "object" && value !== null;
  return isObject;
}
