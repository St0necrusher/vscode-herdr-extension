import * as vscode from "vscode";

export class VsCodeSettings {
  constructor(
    private readonly section: string,
    private readonly keys: readonly string[],
  ) {}

  read<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration(this.section).get<T>(key, defaultValue);
  }

  onDidChange(listener: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      const affectsSettings = this.keys.some((key) => event.affectsConfiguration(`${this.section}.${key}`));
      if (affectsSettings) listener();
    });
  }
}
