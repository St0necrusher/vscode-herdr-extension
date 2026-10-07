import * as vscode from "vscode";
import { getLocation, type Node } from "jsonc-parser";
import type { NavigationContextSource } from "@modules/workspace-context";
import type { NpmScriptTarget } from "../npmScriptCommand";

const hoverCommand = "herdr.runNpmScriptFromHover";

export class VsCodeScriptsView implements vscode.HoverProvider, vscode.Disposable {
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
  scriptAtCursor(): NpmScriptTarget | undefined {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) return undefined;
    const location = scriptLocation(editor.document, editor.selection.active);
    return location === undefined ? undefined : { script: location.script, packageJsonUri: editor.document.uri };
  }

  showNoScriptAtCursorError(): void {
    void vscode.window.showErrorMessage("No npm script at the cursor.");
  }

  showUnexpectedScriptElementError(): void {
    void vscode.window.showErrorMessage(
      "Could not run the script in Herdr: the NPM Scripts item has an unexpected shape.",
    );
  }

  showNoSelectedSpaceError(): void {
    void vscode.window.showErrorMessage("Select a Herdr Space to run the script in.");
  }

  showScriptTabCreationError(error: unknown): void {
    void vscode.window.showErrorMessage(`Could not create a Herdr Tab for the script: ${errorMessage(error)}`);
  }

  showScriptRunError(error: unknown): void {
    void vscode.window.showErrorMessage(
      `Herdr Tab was created but the script could not be started: ${errorMessage(error)}`,
    );
  }

  showScriptPaneOpenError(error: unknown): void {
    void vscode.window.showErrorMessage(`Script was started but its Pane could not be opened: ${errorMessage(error)}`);
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

// The element is the npm extension's internal NpmScript tree item, so it can only be duck-typed.
export function npmViewScriptTarget(element: unknown): NpmScriptTarget | undefined {
  const script = property(property(property(element, "task"), "definition"), "script");
  const packageJsonUri = property(property(element, "package"), "resourceUri");
  const isNpmScript = typeof script === "string" && packageJsonUri instanceof vscode.Uri;
  if (!isNpmScript) return undefined;
  return { script, packageJsonUri };
}

export function hoverScriptTarget(args: unknown): NpmScriptTarget | undefined {
  const script = property(args, "script");
  const documentUri = property(args, "documentUri");
  const isHoverArgs = typeof script === "string" && typeof documentUri === "string";
  if (!isHoverArgs) return undefined;
  return { script, packageJsonUri: vscode.Uri.parse(documentUri) };
}

function property(value: unknown, key: string): unknown {
  const isObject = typeof value === "object" && value !== null;
  return isObject ? (value as Record<string, unknown>)[key] : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
