import * as vscode from "vscode";
import { waitForEditorGroups } from "@core/editor-groups";
import { errorMessage } from "@core/errors";
import { paneName, tabLayoutTree, type TabLayoutTree } from "@modules/sessions";
import { paneTerminalOpenRequest, type PaneTerminalPlacement } from "@modules/pane-editors";
import type { NavigationContextSource } from "@modules/workspace-context";

export class OpenTabFeature implements vscode.Disposable {
  private readonly command: vscode.Disposable;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly editors: PaneTerminalPlacement,
  ) {
    this.command = vscode.commands.registerCommand("herdr.openTab", async (tabId: unknown) => {
      if (typeof tabId === "string") {
        try {
          await this.openTab(tabId);
        } catch (error) {
          void vscode.window.showErrorMessage(`Could not open Tab: ${errorMessage(error)}`);
        }
      }
    });
  }

  dispose(): void {
    this.command.dispose();
  }

  private async openTab(tabId: string): Promise<void> {
    const state = this.context.getState();
    if (state.kind === "unavailable") return;
    const layout = state.snapshot.layouts.find((candidate) => candidate.herdrTabId === tabId);
    if (layout === undefined) throw new Error("Herdr Tab layout is unavailable");
    const tree = tabLayoutTree(layout);
    const requests = paneIds(tree).map((paneId) => {
      const pane = state.snapshot.panes.find((candidate) => candidate.id === paneId);
      if (pane === undefined) throw new Error("Missing layout Pane");
      return paneTerminalOpenRequest(state.sessionId, pane, paneName(pane));
    });
    await this.editors.closeDisplacedPanes(requests);
    await vscode.commands.executeCommand("vscode.setEditorLayout", editorLayout(tree));
    await waitForEditorGroups(() => (vscode.window.tabGroups.all.length === requests.length ? true : undefined));
    await this.editors.placePanes(requests);
    await this.editors.focusPane(state.sessionId, layout.focusedPaneId);
  }
}

interface EditorLayoutGroup {
  readonly size: number;
  readonly groups?: readonly EditorLayoutGroup[];
}
interface EditorLayout {
  readonly orientation: number;
  readonly groups: readonly EditorLayoutGroup[];
}

function editorLayout(tree: TabLayoutTree): EditorLayout {
  const group = (node: TabLayoutTree): EditorLayoutGroup =>
    node.kind === "pane" ? { size: node.size } : { size: node.size, groups: node.children.map(group) };
  return tree.kind === "pane"
    ? { orientation: 0, groups: [{ size: tree.size }] }
    : { orientation: tree.direction === "right" ? 0 : 1, groups: tree.children.map(group) };
}

function paneIds(node: TabLayoutTree): string[] {
  return node.kind === "pane" ? [node.paneId] : node.children.flatMap(paneIds);
}
