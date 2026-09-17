import * as vscode from "vscode";
import type { HerdrLogger } from "#capabilities/runtime";
import type {
  HerdrStatusAction,
  HerdrStatusModel,
  HerdrStatusView,
} from "#capabilities/sessions";

type StatusTone = "checking" | "connected" | "failed";

type StatusQuickPickItem = vscode.QuickPickItem &
  Readonly<{ id: HerdrStatusAction }>;

type StatusPresentation = Readonly<{
  description: string;
  tone: StatusTone;
  actions: readonly StatusQuickPickItem[];
}>;

export class VsCodeHerdrStatusView implements HerdrStatusView {
  readonly #logger: HerdrLogger;
  readonly #status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50,
  );

  constructor(logger: HerdrLogger) {
    this.#logger = logger;
    this.#status.name = "Herdr status";
    this.#status.command = "herdr.showStatusActions";
    this.#status.show();
  }

  render(status: HerdrStatusModel): void {
    const presentation = statusPresentation(status);
    this.#status.text = `${presentation.tone === "checking" ? "$(loading~spin)" : "$(circle-filled)"} Herdr`;
    this.#status.color = new vscode.ThemeColor(
      presentation.tone === "connected"
        ? "testing.iconPassed"
        : presentation.tone === "checking"
          ? "testing.iconQueued"
          : "testing.iconFailed",
    );
    this.#status.tooltip = new vscode.MarkdownString(
      formatTooltip(status, presentation),
    );
    this.#status.accessibilityInformation = {
      label: `Herdr: ${presentation.description}`,
    };
    this.#logger.info(formatDiagnostics(status));
  }

  async chooseAction(
    status: HerdrStatusModel,
  ): Promise<HerdrStatusAction | undefined> {
    const presentation = statusPresentation(status);
    const selected = await vscode.window.showQuickPick(presentation.actions, {
      title: `Herdr: ${presentation.description}`,
      placeHolder: "Choose an action",
    });
    return selected?.id;
  }

  dispose(): void {
    this.#status.dispose();
  }
}

function statusPresentation(status: HerdrStatusModel): StatusPresentation {
  return {
    description: statusDescription(status.kind),
    tone: statusTone(status.kind),
    actions: status.availableActions.map(actionPresentation),
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
    case "connected":
      return "connected";
    case "incompatible":
      return "incompatible";
    case "error":
      return "unavailable";
  }
}

function statusTone(kind: HerdrStatusModel["kind"]): StatusTone {
  switch (kind) {
    case "checking":
      return "checking";
    case "connected":
      return "connected";
    case "missing-executable":
    case "stopped":
    case "incompatible":
    case "error":
      return "failed";
  }
}

function actionPresentation(action: HerdrStatusAction): StatusQuickPickItem {
  switch (action) {
    case "start":
      return { id: action, label: "Start Herdr" };
    case "select-executable":
      return { id: action, label: "Select Herdr Executable" };
    case "open-settings":
      return { id: action, label: "Open Settings" };
    case "retry":
      return { id: action, label: "Retry" };
    case "show-diagnostics":
      return { id: action, label: "Show Diagnostics" };
  }
}

function formatTooltip(
  status: HerdrStatusModel,
  presentation: StatusPresentation,
): string {
  const lines = [
    `**Herdr — ${presentation.description}**`,
    "",
    statusMessage(status),
    "",
    `Session: \`${status.herdrSession}\``,
    `Executable: \`${status.executable}\``,
  ];
  for (const fact of diagnosticFacts(status)) {
    lines.push(`${fact.label}: \`${fact.value}\``);
  }
  lines.push("", "Click for recovery and diagnostic actions.");
  return lines.join("  \n");
}

function formatDiagnostics(status: HerdrStatusModel): string {
  const details = [
    statusMessage(status),
    `Session: ${status.herdrSession}.`,
    `Executable: ${status.executable}.`,
  ];
  for (const fact of diagnosticFacts(status)) {
    details.push(`${fact.label}: ${fact.value}.`);
  }
  return `[${status.kind}] ${details.join(" ")}`;
}

function diagnosticFacts(
  status: HerdrStatusModel,
): readonly Readonly<{ label: string; value: string }>[] {
  if (status.kind !== "connected" && status.kind !== "incompatible") return [];
  return [
    ...(status.version === undefined
      ? []
      : [{ label: "Version", value: status.version }]),
    ...(status.protocol === undefined
      ? []
      : [{ label: "Protocol", value: String(status.protocol) }]),
    ...(status.endpoint === undefined
      ? []
      : [{ label: "Endpoint", value: status.endpoint }]),
  ];
}

function statusMessage(status: HerdrStatusModel): string {
  switch (status.kind) {
    case "checking":
      return "Discovering Herdr.";
    case "missing-executable":
      return `Herdr executable was not found: ${status.executable}`;
    case "stopped":
      return `The ${formatHerdrSession(status.herdrSession)} Herdr Session is stopped.`;
    case "connected":
      return `Connected to the ${formatHerdrSession(status.herdrSession)} Herdr Session.`;
    case "incompatible":
      return `The ${formatHerdrSession(status.herdrSession)} Herdr Session is incompatible.`;
    case "error":
      return status.diagnostic;
  }
}

function formatHerdrSession(herdrSession: string): string {
  return herdrSession === "default" ? "default" : `"${herdrSession}"`;
}
