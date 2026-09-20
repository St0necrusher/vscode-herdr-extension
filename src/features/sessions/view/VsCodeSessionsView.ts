import * as vscode from "vscode";
import type { HerdrConnectionFailure } from "#capabilities/sessions";
import type { SessionsState, SessionsStateSource } from "../capabilities/index.js";

export class VsCodeSessionsView implements vscode.TreeDataProvider<SessionTreeItem>, vscode.Disposable {
  private readonly changes: vscode.EventEmitter<SessionTreeItem | undefined | null>;
  private readonly subscription: { dispose(): void };
  private readonly registration: vscode.Disposable;
  private readonly source: SessionsStateSource;
  private disposed = false;
  readonly onDidChangeTreeData: vscode.Event<SessionTreeItem | undefined | null>;

  constructor(source: SessionsStateSource) {
    const changes = new vscode.EventEmitter<SessionTreeItem | undefined | null>();
    this.changes = changes;
    this.source = source;
    this.onDidChangeTreeData = changes.event;
    let subscription: { dispose(): void } | undefined;
    try {
      subscription = source.onDidChange(() => changes.fire(undefined));
      this.registration = vscode.window.registerTreeDataProvider("herdr.sessions", this);
      this.subscription = subscription;
    } catch (error) {
      subscription?.dispose();
      changes.dispose();
      throw error;
    }
  }

  getTreeItem(item: SessionTreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(element?: SessionTreeItem): SessionTreeItem[] {
    if (element !== undefined) return [];
    const state = this.source.getState();
    const sessions =
      state.catalog.kind === "ready" || state.catalog.kind === "error" ? state.catalog.sessions : undefined;
    if (sessions === undefined) return [];
    return [...sessions]
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.id.localeCompare(right.id))
      .map((session) => new SessionTreeItem(session.id, session.isDefault, session.availability, state));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription.dispose();
    this.registration.dispose();
    this.changes.dispose();
  }
}

class SessionTreeItem extends vscode.TreeItem {
  constructor(id: string, isDefault: boolean, availability: "running" | "stopped", state: SessionsState) {
    const selected = state.active.kind !== "unselected" && state.active.session.id === id;
    const current = selected ? state.active.kind : availability;
    const description = [isDefault ? "default" : undefined, selected ? "selected" : undefined, label(current)]
      .filter((part): part is string => part !== undefined)
      .join(" · ");
    super(id, vscode.TreeItemCollapsibleState.None);
    this.id = id;
    this.description = description;
    this.contextValue = "herdr.session";
    this.iconPath = new vscode.ThemeIcon(icon(current));
    this.tooltip = tooltip(id, isDefault, selected, current, state);
    this.accessibilityInformation = { label: `${id}, ${description}` };
    this.command = { command: "herdr.selectSession", title: "Select Herdr Session", arguments: [id] };
  }
}

type RowState =
  | "running"
  | "stopped"
  | "selected-stopped"
  | "start-failed"
  | "resolving"
  | "connecting"
  | "connected"
  | "incompatible"
  | "disconnected";

function label(state: RowState): string {
  if (state === "selected-stopped") return "stopped";
  if (state === "start-failed") return "start failed";
  return state;
}
function icon(state: RowState): string {
  if (state === "connected") return "pass-filled";
  if (state === "connecting" || state === "resolving") return "loading~spin";
  if (state === "stopped" || state === "selected-stopped") return "circle-slash";
  if (state === "start-failed" || state === "incompatible" || state === "disconnected") return "error";
  return "circle-filled";
}
function tooltip(id: string, isDefault: boolean, selected: boolean, current: RowState, state: SessionsState): string {
  const lines = [
    `Herdr Session: ${id}`,
    `Default: ${isDefault ? "yes" : "no"}`,
    `Selected: ${selected ? "yes" : "no"}`,
    `State: ${label(current)}`,
  ];
  const active = state.active;
  if (!selected || active.kind === "unselected") return lines.join("\n");
  if (active.kind === "start-failed") lines.push(`Diagnostic: ${active.diagnostic}`);
  if (active.kind === "connecting" || active.kind === "connected") lines.push(`Endpoint: ${active.endpoint}`);
  if (active.kind === "connected")
    lines.push(`Version: ${active.metadata.version}`, `Protocol: ${active.metadata.protocol}`);
  if (active.kind === "incompatible")
    lines.push(
      `Diagnostic: ${active.failure.diagnostic}`,
      ...(active.endpoint ? [`Endpoint: ${active.endpoint}`] : []),
      ...(active.failure.version === undefined ? [] : [`Version: ${active.failure.version}`]),
      ...(active.failure.protocol === undefined ? [] : [`Protocol: ${active.failure.protocol}`]),
    );
  if (active.kind === "disconnected")
    lines.push(
      `Diagnostic: ${failureDiagnostic(active.failure)}`,
      ...(active.endpoint ? [`Endpoint: ${active.endpoint}`] : []),
      ...(active.metadata?.version === undefined ? [] : [`Version: ${active.metadata.version}`]),
      ...(active.metadata?.protocol === undefined ? [] : [`Protocol: ${active.metadata.protocol}`]),
    );
  return lines.join("\n");
}
function failureDiagnostic(failure: HerdrConnectionFailure): string {
  return failure.kind === "herdr-error" ? `${failure.code}: ${failure.message}` : failure.diagnostic;
}
