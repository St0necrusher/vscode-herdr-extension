import * as vscode from "vscode";
import type { SessionsOperations } from "@modules/sessions";

export class StartLocalSessionFeature implements vscode.Disposable {
  private readonly command: vscode.Disposable;

  constructor(private readonly operations: Pick<SessionsOperations, "startSelectedSession">) {
    this.command = vscode.commands.registerCommand("herdr.start", () => this.start());
  }

  start(): Promise<void> {
    return this.operations.startSelectedSession();
  }

  dispose(): void {
    this.command.dispose();
  }
}
