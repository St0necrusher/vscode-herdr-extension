import * as vscode from "vscode";
import type { HerdrAgentStatus } from "@capabilities/sessions";
import { agentRowUri } from "../../shared/view";
import type { AgentNavigationRow, AgentsModel, AgentsState } from "../AgentsModel";

export class VsCodeAgentsView implements vscode.TreeDataProvider<AgentTreeItem>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<AgentTreeItem | undefined | null>();
  private readonly subscription: { dispose(): void };
  private readonly view: vscode.TreeView<AgentTreeItem>;
  private disposed = false;
  readonly onDidChangeTreeData = this.changes.event;

  constructor(private readonly model: AgentsModel) {
    this.view = vscode.window.createTreeView("herdr.agents", { treeDataProvider: this });
    this.subscription = model.onDidChange((state) => {
      setMessage(this.view, state);
      this.changes.fire(undefined);
    });
    setMessage(this.view, model.getState());
  }

  getTreeItem(item: AgentTreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(element?: AgentTreeItem): AgentTreeItem[] {
    if (element !== undefined) return [];
    const state = this.model.getState();
    setMessage(this.view, state);
    if (state.kind === "unavailable") return [];
    return state.rows.map((row) => new AgentTreeItem(row));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription.dispose();
    this.view.dispose();
    this.changes.dispose();
  }
}

export class AgentTreeItem extends vscode.TreeItem {
  constructor(row: AgentNavigationRow) {
    super(row.label, vscode.TreeItemCollapsibleState.None);
    const status = statusText[row.agent.agentStatus];
    this.id = `herdr.agent.${row.pane.id}`;
    this.description = `${row.space.label} · ${row.paneName}`;
    this.iconPath = statusIcon[row.agent.agentStatus];
    this.command = { command: "herdr.openAgentPane", title: "Open Agent Pane", arguments: [row.pane.id] };
    this.resourceUri = agentRowUri(row.pane.id);
    this.tooltip = tooltip(row, status);
    this.accessibilityInformation = { label: `${row.label}, ${status}, ${this.description}` };
  }
}

// Each status has its own glyph, so status never depends on color alone.
const statusIcon: Readonly<Record<HerdrAgentStatus, vscode.ThemeIcon>> = {
  working: new vscode.ThemeIcon("loading~spin"),
  blocked: new vscode.ThemeIcon("bell-dot"),
  done: new vscode.ThemeIcon("check"),
  idle: new vscode.ThemeIcon("circle-outline"),
  unknown: new vscode.ThemeIcon("question"),
};

const statusText: Readonly<Record<HerdrAgentStatus, string>> = {
  working: "Working",
  blocked: "Blocked",
  done: "Done",
  idle: "Idle",
  unknown: "Unknown",
};

function tooltip(row: AgentNavigationRow, status: string): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString();
  const line = (name: string, value: string): void => {
    markdown.appendMarkdown(`- **${name}:** `);
    markdown.appendText(value);
    markdown.appendMarkdown("\n");
  };
  line("Status", status);
  line("Space", row.space.label);
  line("Herdr Tab", row.tab.label);
  line("Pane", row.paneName);
  if (row.agent.cwd !== undefined) line("cwd", row.agent.cwd);
  return markdown;
}

function setMessage(view: vscode.TreeView<AgentTreeItem>, state: AgentsState): void {
  const message =
    state.kind === "unavailable"
      ? "Herdr Session is not connected"
      : state.rows.length === 0
        ? "No Agents in this Herdr Session"
        : undefined;
  // Assign rather than delete: TreeView.message is an accessor, and VS Code clears it with "".
  view.message = message ?? "";
}
