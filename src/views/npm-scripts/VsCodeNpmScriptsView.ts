import * as vscode from "vscode";
import { getLocation, type Node } from "jsonc-parser";
import type { NavigationContextSource } from "@modules/workspace-context";

const hoverCommand = "herdr.runNpmScriptFromHover";

export class VsCodeNpmScriptsView implements vscode.HoverProvider, vscode.Disposable {
  private readonly hover: vscode.Disposable;
  private disposed = false;

  constructor(private readonly context: NavigationContextSource) {
    this.hover = vscode.languages.registerHoverProvider(
      { language: "json", scheme: "file", pattern: "**/package.json" },
      this,
    );
  }

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    if (this.context.getState().kind !== "connected") return undefined;

    // Like VS Code's own script hover, the link is offered on the script name only.
    const location = scriptLocation(document, position);
    if (location?.isAtPropertyKey !== true) return undefined;

    const { script, node } = location;
    const args = encodeURIComponent(JSON.stringify([{ script, documentUri: document.uri.toString() }]));
    const markdown = new vscode.MarkdownString(
      `[Run in Herdr](command:${hoverCommand}?${args} "Run the script in a new Herdr Tab")`,
    );
    markdown.isTrusted = { enabledCommands: [hoverCommand] };
    return new vscode.Hover(
      markdown,
      new vscode.Range(document.positionAt(node.offset), document.positionAt(node.offset + node.length)),
    );
  }

  // Like VS Code's Run Script in the editor context menu: the cursor may be on the script name or its command.
  scriptAtCursor(): Readonly<{ script: string; packageJsonUri: vscode.Uri }> | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) return undefined;
    const location = scriptLocation(editor.document, editor.selection.active);
    return location === undefined ? undefined : { script: location.script, packageJsonUri: editor.document.uri };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hover.dispose();
  }
}

function scriptLocation(
  document: vscode.TextDocument,
  position: vscode.Position,
): Readonly<{ script: string; isAtPropertyKey: boolean; node: Node }> | undefined {
  const location = getLocation(document.getText(), document.offsetAt(position));
  const [section, script] = location.path;
  const isScript = location.path.length === 2 && section === "scripts" && typeof script === "string";
  const { previousNode } = location;
  const hasScriptNode = isScript && previousNode !== undefined;
  if (!hasScriptNode) return undefined;
  return { script, isAtPropertyKey: location.isAtPropertyKey, node: previousNode };
}
