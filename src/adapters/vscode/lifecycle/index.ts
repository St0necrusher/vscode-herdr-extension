import * as vscode from "vscode";
import type {
  HerdrAvailability,
  HerdrAvailabilityView,
  HerdrSettingsPort,
  LifecycleLogger,
} from "../../../features/lifecycle/index.js";

export interface LifecycleCommandHandlers {
  retry(): Promise<void>;
  start(): Promise<void>;
}

export interface VsCodeLifecycleAdapter {
  settings: HerdrSettingsPort;
  view: HerdrAvailabilityView;
  logger: LifecycleLogger;
  registerCommands(handlers: LifecycleCommandHandlers): void;
  dispose(): void;
}

export function createVsCodeLifecycleAdapter(): VsCodeLifecycleAdapter {
  const disposables: vscode.Disposable[] = [];
  const output = vscode.window.createOutputChannel("Herdr", { log: true });
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50,
  );
  status.name = "Herdr status";
  status.command = "herdr.showStatusActions";
  status.show();
  disposables.push(output, status);

  let latest: HerdrAvailability = {
    kind: "checking",
    settings: readSettings(),
  };

  const logger: LifecycleLogger = {
    info(message) {
      output.info(message);
    },
    error(message, error) {
      const detail =
        error instanceof Error ? (error.stack ?? error.message) : error;
      output.error(message, detail);
    },
  };

  const view: HerdrAvailabilityView = {
    render(availability) {
      latest = availability;
      renderStatus(status, availability);
      output.info(formatDiagnostics(availability));
    },
  };

  const settings: HerdrSettingsPort = {
    read: readSettings,
    onDidChange(listener) {
      return vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("herdr.executable") ||
          event.affectsConfiguration("herdr.session")
        ) {
          listener();
        }
      });
    },
  };

  return {
    settings,
    view,
    logger,
    registerCommands(handlers) {
      disposables.push(
        vscode.commands.registerCommand("herdr.retryDiscovery", () =>
          handlers.retry(),
        ),
        vscode.commands.registerCommand("herdr.start", () => handlers.start()),
        vscode.commands.registerCommand(
          "herdr.selectExecutable",
          selectExecutable,
        ),
        vscode.commands.registerCommand("herdr.openSettings", openSettings),
        vscode.commands.registerCommand("herdr.showStatusActions", async () => {
          await showStatusActions(latest, handlers, output);
        }),
      );
    },
    dispose() {
      vscode.Disposable.from(...disposables.splice(0)).dispose();
    },
  };
}

function readSettings() {
  const configuration = vscode.workspace.getConfiguration("herdr");
  const executable = configuration.get<string>("executable", "herdr").trim();
  const session = configuration.get<string>("session", "default").trim();
  return {
    executable: executable || "herdr",
    session: session || "default",
  };
}

async function selectExecutable(): Promise<void> {
  const selection = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: "Select Herdr Executable",
    title: "Select Herdr Executable",
  });
  const executable = selection?.[0]?.fsPath;
  if (executable === undefined) return;
  await vscode.workspace
    .getConfiguration("herdr")
    .update("executable", executable, vscode.ConfigurationTarget.Global);
}

async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand(
    "workbench.action.openSettings",
    "@ext:St0necrusher.vscode-herdr-extension",
  );
}

async function showStatusActions(
  availability: HerdrAvailability,
  handlers: LifecycleCommandHandlers,
  output: vscode.LogOutputChannel,
): Promise<void> {
  const actions = actionsFor(availability);
  const selected = await vscode.window.showQuickPick(actions, {
    title: `Herdr: ${shortDescription(availability)}`,
    placeHolder: "Choose an action",
  });
  if (selected === undefined) return;

  switch (selected) {
    case "Start Herdr":
      await handlers.start();
      break;
    case "Select Herdr Executable":
      await selectExecutable();
      break;
    case "Open Settings":
      await openSettings();
      break;
    case "Retry":
      await handlers.retry();
      break;
    case "Show Diagnostics":
      output.show(true);
      break;
  }
}

function actionsFor(availability: HerdrAvailability): string[] {
  switch (availability.kind) {
    case "missing-binary":
      return [
        "Select Herdr Executable",
        "Open Settings",
        "Retry",
        "Show Diagnostics",
      ];
    case "stopped":
      return ["Start Herdr", "Retry", "Open Settings", "Show Diagnostics"];
    case "checking":
      return ["Retry", "Open Settings", "Show Diagnostics"];
    case "connected":
    case "incompatible":
    case "error":
      return ["Retry", "Open Settings", "Show Diagnostics"];
  }
}

function renderStatus(
  item: vscode.StatusBarItem,
  availability: HerdrAvailability,
): void {
  const isChecking = availability.kind === "checking";
  const isConnected = availability.kind === "connected";
  item.text = `${isChecking ? "$(loading~spin)" : "$(circle-filled)"} Herdr`;
  item.color = new vscode.ThemeColor(
    isConnected
      ? "testing.iconPassed"
      : isChecking
        ? "testing.iconQueued"
        : "testing.iconFailed",
  );
  item.tooltip = new vscode.MarkdownString(formatTooltip(availability));
  item.accessibilityInformation = {
    label: `Herdr: ${shortDescription(availability)}`,
  };
}

function formatTooltip(availability: HerdrAvailability): string {
  const lines = [
    `**Herdr — ${shortDescription(availability)}**`,
    "",
    availability.kind === "checking"
      ? "Discovering Herdr."
      : availability.detail,
    "",
    `Session: \`${availability.settings.session}\``,
    `Executable: \`${availability.settings.executable}\``,
  ];
  if (availability.kind === "connected") {
    lines.push(
      `Version: \`${availability.version}\``,
      `Protocol: \`${availability.protocol}\``,
      `Endpoint: \`${availability.endpoint}\``,
    );
  } else if (availability.kind === "incompatible") {
    if (availability.version !== undefined)
      lines.push(`Version: \`${availability.version}\``);
    if (availability.protocol !== undefined)
      lines.push(`Protocol: \`${availability.protocol}\``);
    if (availability.endpoint !== undefined)
      lines.push(`Endpoint: \`${availability.endpoint}\``);
  }
  lines.push("", "Click for recovery and diagnostic actions.");
  return lines.join("  \n");
}

function formatDiagnostics(availability: HerdrAvailability): string {
  return `[${availability.kind}] ${formatTooltip(availability).replaceAll("`", "")}`;
}

function shortDescription(availability: HerdrAvailability): string {
  switch (availability.kind) {
    case "checking":
      return "checking";
    case "missing-binary":
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
