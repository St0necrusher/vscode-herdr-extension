import * as vscode from "vscode";
import type { HerdrLogger } from "@capabilities/runtime";
import type { HerdrStatusAction, HerdrStatusModel } from "../../capabilities";

type StatusTone = "checking" | "connected" | "failed";
type Item = vscode.QuickPickItem & Readonly<{ id: HerdrStatusAction }>;

export class VsCodeStatusView implements vscode.Disposable {
  private readonly logger: HerdrLogger;
  private readonly status: vscode.StatusBarItem;
  constructor(logger: HerdrLogger) {
    this.logger = logger;
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    try {
      status.name = "Herdr status";
      status.command = "herdr.showStatusActions";
      status.show();
      this.status = status;
    } catch (error) {
      status.dispose();
      throw error;
    }
  }
  render(model: HerdrStatusModel): void {
    const presentation = statusPresentation(model);
    this.status.text = `${presentation.tone === "checking" ? "$(loading~spin)" : "$(circle-filled)"} Herdr`;
    this.status.color = new vscode.ThemeColor(
      presentation.tone === "connected"
        ? "testing.iconPassed"
        : presentation.tone === "checking"
          ? "testing.iconQueued"
          : "testing.iconFailed",
    );
    this.status.tooltip = new vscode.MarkdownString(formatTooltip(model, presentation));
    this.status.accessibilityInformation = { label: `Herdr: ${presentation.description}` };
    this.logger.info(formatDiagnostics(model));
  }
  async chooseAction(model: HerdrStatusModel): Promise<HerdrStatusAction | undefined> {
    const selected = await vscode.window.showQuickPick(statusPresentation(model).actions, {
      title: `Herdr: ${statusDescription(model.kind)}`,
      placeHolder: "Choose an action",
    });
    return selected?.id;
  }
  dispose(): void {
    this.status.dispose();
  }
}
function statusPresentation(
  model: HerdrStatusModel,
): Readonly<{ description: string; tone: StatusTone; actions: readonly Item[] }> {
  return {
    description: statusDescription(model.kind),
    tone: statusTone(model.kind),
    actions: model.availableActions.map(actionPresentation),
  };
}
function statusDescription(kind: HerdrStatusModel["kind"]): string {
  switch (kind) {
    case "checking":
      return "checking";
    case "missing-executable":
      return "executable missing";
    case "stopped":
      return "Session stopped";
    case "resolving":
      return "resolving Session";
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "incompatible":
      return "incompatible";
    case "disconnected":
      return "disconnected";
    case "error":
      return "unavailable";
  }
}
function statusTone(kind: HerdrStatusModel["kind"]): StatusTone {
  if (kind === "connected") return "connected";
  if (kind === "checking" || kind === "resolving" || kind === "connecting") return "checking";
  return "failed";
}
function actionPresentation(id: HerdrStatusAction): Item {
  const labels: Record<HerdrStatusAction, string> = {
    start: "Start Herdr",
    "select-executable": "Select Herdr Executable",
    "open-settings": "Open Settings",
    retry: "Retry",
    "show-diagnostics": "Show Diagnostics",
  };
  return { id, label: labels[id] };
}
function formatTooltip(model: HerdrStatusModel, presentation: Readonly<{ description: string }>): string {
  const lines = [
    `**Herdr — ${presentation.description}**`,
    "",
    statusMessage(model),
    "",
    `Session: \`${model.herdrSession}\``,
    `Executable: \`${model.executable}\``,
  ];
  if (model.kind === "connected") {
    lines.push(`Endpoint: \`${model.endpoint}\``, `Version: \`${model.version}\``, `Protocol: \`${model.protocol}\``);
  } else if (model.kind === "incompatible" || model.kind === "disconnected") {
    appendFact(lines, "Endpoint", model.endpoint);
    appendFact(lines, "Version", model.version);
    appendFact(lines, "Protocol", model.protocol);
    lines.push(`Diagnostic: ${model.diagnostic}`);
  } else if (model.kind === "error") {
    lines.push(`Diagnostic: ${model.diagnostic}`);
  }
  lines.push("", "Click for recovery and diagnostic actions.");
  return lines.join("  \n");
}
function appendFact(lines: string[], label: string, value: string | number | undefined): void {
  if (value !== undefined) lines.push(`${label}: \`${value}\``);
}
function formatDiagnostics(model: HerdrStatusModel): string {
  return `[${model.kind}] ${statusMessage(model)} Session: ${model.herdrSession}. Executable: ${model.executable}.`;
}
function statusMessage(model: HerdrStatusModel): string {
  switch (model.kind) {
    case "checking":
      return "Discovering Herdr.";
    case "missing-executable":
      return `Herdr executable was not found: ${model.executable}`;
    case "stopped":
      return `The ${model.herdrSession} Herdr Session is stopped.`;
    case "resolving":
      return `Resolving the ${model.herdrSession} Herdr Session.`;
    case "connecting":
      return `Connecting to the ${model.herdrSession} Herdr Session.`;
    case "connected":
      return `Connected to the ${model.herdrSession} Herdr Session.`;
    case "incompatible":
    case "disconnected":
    case "error":
      return model.diagnostic;
  }
}
