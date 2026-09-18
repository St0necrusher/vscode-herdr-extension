import type * as vscode from "vscode";
import { HerdrExtension } from "./HerdrExtension.js";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const extension = new HerdrExtension();
  context.subscriptions.push(extension);
  await extension.initialize();
}
