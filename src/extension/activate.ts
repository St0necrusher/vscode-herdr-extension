import type * as vscode from "vscode";
import { HerdrExtension } from "./HerdrExtension";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const extension = new HerdrExtension(context);
  context.subscriptions.push(extension);
  await extension.initialize();
}
