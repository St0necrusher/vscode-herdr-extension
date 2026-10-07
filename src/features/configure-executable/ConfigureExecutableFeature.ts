import * as vscode from "vscode";

export class ConfigureExecutableFeature implements vscode.Disposable {
  private readonly command: vscode.Disposable;

  constructor() {
    this.command = vscode.commands.registerCommand("herdr.selectExecutable", () => this.selectExecutable());
  }

  async selectExecutable(): Promise<void> {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: "Select Herdr Executable",
      title: "Select Herdr Executable",
    });
    const executable = selection?.[0]?.fsPath;
    if (executable === undefined) return;
    await vscode.workspace
      .getConfiguration("herdr")
      .update("executable", executable, vscode.ConfigurationTarget.Global);
  }

  dispose(): void {
    this.command.dispose();
  }
}
