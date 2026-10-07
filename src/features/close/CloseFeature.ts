import * as vscode from "vscode";
import type { ActiveSessionManagement } from "@modules/sessions";
import type { PaneTerminalClosing } from "@modules/pane-editors";
import type { NavigationContextSource } from "@modules/workspace-context";
import { closeGroup } from "./closeGroup";
import { closePane } from "./closePane";
import { closeSpace } from "./closeSpace";
import { closeTab } from "./closeTab";

export class CloseFeature implements vscode.Disposable {
  private readonly commands: vscode.Disposable;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly management: ActiveSessionManagement,
    private readonly paneClosing: PaneTerminalClosing,
  ) {
    this.commands = vscode.Disposable.from(
      vscode.commands.registerCommand("herdr.closePane", async (item: unknown) => {
        const paneId = paneIdArgument(item);
        if (paneId !== undefined) await closePane(this.context, this.management, this.paneClosing, paneId);
      }),
      vscode.commands.registerCommand("herdr.closeTab", async (item: unknown) => {
        const tabId = groupTabIdArgument(item);
        if (tabId !== undefined) await closeTab(this.context, this.management, this.paneClosing, tabId);
      }),
      vscode.commands.registerCommand("herdr.closeSpace", async (item: unknown) => {
        const spaceId = spaceIdArgument(item);
        if (spaceId !== undefined) await closeSpace(this.context, this.management, this.paneClosing, spaceId);
      }),
      vscode.commands.registerCommand("herdr.closeGroup", async (item: unknown) => {
        const spaceId = spaceIdArgument(item);
        if (spaceId !== undefined) await closeGroup(this.context, this.management, this.paneClosing, spaceId);
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

function groupTabIdArgument(argument: unknown): string | undefined {
  if (!isRecord(argument)) return undefined;
  const tabId = argument.tabId;
  if (typeof tabId !== "string") return undefined;
  if (!isRecord(argument.group)) return undefined;
  return tabId;
}

function spaceIdArgument(argument: unknown): string | undefined {
  if (!isRecord(argument)) return undefined;
  return typeof argument.spaceId === "string" ? argument.spaceId : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  const isObject = typeof value === "object" && value !== null;
  return isObject;
}
