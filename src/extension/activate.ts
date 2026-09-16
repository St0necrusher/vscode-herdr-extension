import type * as vscode from "vscode";
import { composeExtension } from "./compose.js";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  context.subscriptions.push(await composeExtension());
}
