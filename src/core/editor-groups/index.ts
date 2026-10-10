import * as vscode from "vscode";

function editorGroupFocusCommand(viewColumn: number): string {
  switch (viewColumn) {
    case 1:
      return "workbench.action.focusFirstEditorGroup";
    case 2:
      return "workbench.action.focusSecondEditorGroup";
    case 3:
      return "workbench.action.focusThirdEditorGroup";
    case 4:
      return "workbench.action.focusFourthEditorGroup";
    case 5:
      return "workbench.action.focusFifthEditorGroup";
    case 6:
      return "workbench.action.focusSixthEditorGroup";
    case 7:
      return "workbench.action.focusSeventhEditorGroup";
    default:
      return "workbench.action.focusEighthEditorGroup";
  }
}

export async function focusEditorGroup(viewColumn: number): Promise<void> {
  const command = editorGroupFocusCommand(viewColumn);
  await vscode.commands.executeCommand(command);
  const nextCommands = Array.from({ length: Math.max(0, viewColumn - 8) }, () => "workbench.action.focusNextGroup");
  for (const nextCommand of nextCommands) {
    await vscode.commands.executeCommand(nextCommand);
  }
  const targetColumn: vscode.ViewColumn = viewColumn;
  await waitForEditorGroups(() =>
    vscode.window.tabGroups.activeTabGroup.viewColumn === targetColumn ? true : undefined,
  );
}

// Commands resolve before the extension host receives the resulting tab/group updates.
export function waitForEditorGroups<T>(probe: () => T | undefined): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const subscriptions: vscode.Disposable[] = [];
    const settle = (): void => {
      clearTimeout(timeout);
      subscriptions.forEach((subscription) => {
        subscription.dispose();
      });
    };
    const check = (): void => {
      const value = probe();
      if (value !== undefined) {
        settle();
        resolve(value);
      }
    };
    const timeout = setTimeout(() => {
      settle();
      reject(new Error("Timed out waiting for editor groups"));
    }, 5_000);
    subscriptions.push(
      vscode.window.tabGroups.onDidChangeTabs(check),
      vscode.window.tabGroups.onDidChangeTabGroups(check),
    );
    check();
  });
}
