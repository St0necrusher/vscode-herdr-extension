import * as vscode from "vscode";
import type { NavigationContextSource, VisiblePaneEditorsSource } from "@modules/workspace-context";

const scheme = "herdr-navigation";

// Every Pane, Agent, and Space row carries its URI, so marks change through decoration events, not row re-renders.
export function paneRowUri(paneId: string): vscode.Uri {
  return rowUri("pane", paneId);
}

export function agentRowUri(paneId: string): vscode.Uri {
  return rowUri("agent", paneId);
}

export function spaceRowUri(spaceId: string): vscode.Uri {
  return rowUri("space", spaceId);
}

export class VisiblePaneEditorDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<vscode.Uri[]>();
  private readonly subscriptions: readonly { dispose(): void }[];
  private marked: ReadonlySet<string>;
  readonly onDidChangeFileDecorations = this.changes.event;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly visible: VisiblePaneEditorsSource,
  ) {
    this.marked = this.markedRows();
    this.subscriptions = [
      context.onDidChange(() => this.updateMarks()),
      visible.onDidChangeVisiblePaneIds(() => this.updateMarks()),
    ];
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (!this.marked.has(uri.toString())) return undefined;
    return new vscode.FileDecoration(
      undefined,
      "Visible in an editor",
      new vscode.ThemeColor("gitDecoration.addedResourceForeground"),
    );
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.changes.dispose();
  }

  private updateMarks(): void {
    const previous = this.marked;
    const next = this.markedRows();
    this.marked = next;
    const changed = [...previous].filter((uri) => !next.has(uri)).concat([...next].filter((uri) => !previous.has(uri)));
    if (changed.length > 0) this.changes.fire(changed.map((uri) => vscode.Uri.parse(uri)));
  }

  // A Space row is marked when any of its Panes has a Visible Pane Editor.
  private markedRows(): ReadonlySet<string> {
    const state = this.context.getState();
    if (state.kind === "unavailable") return new Set();
    const visiblePaneIds = this.visible.getVisiblePaneIds();
    const panes = state.snapshot.panes.filter((pane) => visiblePaneIds.has(pane.id));
    return new Set(
      panes.flatMap((pane) => [paneRowUri(pane.id), agentRowUri(pane.id), spaceRowUri(pane.spaceId)].map(String)),
    );
  }
}

function rowUri(kind: string, id: string): vscode.Uri {
  return vscode.Uri.from({ scheme, path: `/${kind}/${id}` });
}
