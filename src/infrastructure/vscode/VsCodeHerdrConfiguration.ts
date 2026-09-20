import * as vscode from "vscode";
import type { HerdrConfiguration, HerdrConfigurationActions, HerdrConfigurationSource } from "@capabilities/sessions";

export class VsCodeHerdrConfiguration implements HerdrConfigurationSource, HerdrConfigurationActions {
  read(): HerdrConfiguration {
    const configuration = vscode.workspace.getConfiguration("herdr");
    const executable = configuration.get<string>("executable", "herdr").trim();
    const session = configuration.get<string>("session", "default").trim();
    return {
      executable: executable || "herdr",
      session: session || "default",
    };
  }

  onDidChange(listener: () => void): { dispose(): void } {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("herdr.executable") || event.affectsConfiguration("herdr.session")) {
        listener();
      }
    });
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

  async openSettings(): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:St0necrusher.vscode-herdr-extension");
  }
}
