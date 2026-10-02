import * as vscode from "vscode";

export type NpmScriptTarget = Readonly<{ script: string; packageJsonUri: vscode.Uri }>;

// Matches VS Code's Run Script: the npm extension resolves the runner for the workspace folder.
export async function npmScriptCommand(target: NpmScriptTarget): Promise<string> {
  const folder = vscode.workspace.getWorkspaceFolder(target.packageJsonUri)?.uri ?? packageFolder(target);
  const runner = await resolveRunner(folder);
  const script = shellQuote(target.script);
  return runner === "node" ? `node --run ${script}` : `${runner} run ${script}`;
}

export function packageFolder(target: NpmScriptTarget): vscode.Uri {
  return vscode.Uri.joinPath(target.packageJsonUri, "..");
}

async function resolveRunner(folder: vscode.Uri): Promise<string> {
  for (const command of ["npm.scriptRunner", "npm.packageManager"]) {
    try {
      const runner = await vscode.commands.executeCommand(command, folder);
      const isRunner = typeof runner === "string" && runner.length > 0;
      if (isRunner) return runner;
    } catch {
      // The npm extension is disabled or does not register this command; try the next source.
    }
  }
  return "npm";
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}
