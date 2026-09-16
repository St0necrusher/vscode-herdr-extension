import * as vscode from "vscode";
import type {
  HerdrAvailability,
  HerdrAvailabilityView,
  HerdrSettingsPort,
  LifecycleLogger,
} from "../../../features/lifecycle/index.js";

/** User-initiated lifecycle commands supplied by the composition root. */
export interface LifecycleCommandHandlers {
  retry(): Promise<void>;
  start(): Promise<void>;
}

/**
 * Owns the compact status item, Herdr log Output channel, configuration listener,
 * and native recovery commands. `registerCommands` is called once during
 * composition. `dispose` is idempotent and releases every owned VS Code resource.
 */
export interface VsCodeLifecycleAdapter {
  settings: HerdrSettingsPort;
  view: HerdrAvailabilityView;
  logger: LifecycleLogger;
  registerCommands(handlers: LifecycleCommandHandlers): void;
  dispose(): void;
}

/** Creates an immediately visible checking status and a hidden log channel. */
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

type ActionId =
  | "start"
  | "select-executable"
  | "open-settings"
  | "retry"
  | "show-diagnostics";

type StatusTone = "checking" | "connected" | "failed";

type StatusAction = vscode.QuickPickItem & Readonly<{ id: ActionId }>;

type StatusPresentation = Readonly<{
  description: string;
  tone: StatusTone;
  actions: readonly StatusAction[];
}>;

async function showStatusActions(
  availability: HerdrAvailability,
  handlers: LifecycleCommandHandlers,
  output: vscode.LogOutputChannel,
): Promise<void> {
  const presentation = statusPresentation(availability);
  const selected = await vscode.window.showQuickPick(presentation.actions, {
    title: `Herdr: ${presentation.description}`,
    placeHolder: "Choose an action",
  });
  if (selected === undefined) return;

  switch (selected.id) {
    case "start":
      await handlers.start();
      break;
    case "select-executable":
      await selectExecutable();
      break;
    case "open-settings":
      await openSettings();
      break;
    case "retry":
      await handlers.retry();
      break;
    case "show-diagnostics":
      output.show(true);
      break;
  }
}

function statusPresentation(
  availability: HerdrAvailability,
): StatusPresentation {
  const standardActions = [
    action("retry", "Retry"),
    action("open-settings", "Open Settings"),
    action("show-diagnostics", "Show Diagnostics"),
  ];
  switch (availability.kind) {
    case "checking":
      return {
        description: "checking",
        tone: "checking",
        actions: standardActions,
      };
    case "missing-binary":
      return {
        description: "executable missing",
        tone: "failed",
        actions: [
          action("select-executable", "Select Herdr Executable"),
          ...standardActions,
        ],
      };
    case "stopped":
      return {
        description: "Session stopped",
        tone: "failed",
        actions: [action("start", "Start Herdr"), ...standardActions],
      };
    case "connected":
      return {
        description: "connected",
        tone: "connected",
        actions: standardActions,
      };
    case "incompatible":
      return {
        description: "incompatible",
        tone: "failed",
        actions: standardActions,
      };
    case "error":
      return {
        description: "unavailable",
        tone: "failed",
        actions: standardActions,
      };
  }
}

function action(id: ActionId, label: string): StatusAction {
  return { id, label };
}

function renderStatus(
  item: vscode.StatusBarItem,
  availability: HerdrAvailability,
): void {
  const presentation = statusPresentation(availability);
  item.text = `${presentation.tone === "checking" ? "$(loading~spin)" : "$(circle-filled)"} Herdr`;
  item.color = new vscode.ThemeColor(
    presentation.tone === "connected"
      ? "testing.iconPassed"
      : presentation.tone === "checking"
        ? "testing.iconQueued"
        : "testing.iconFailed",
  );
  item.tooltip = new vscode.MarkdownString(formatTooltip(availability));
  item.accessibilityInformation = {
    label: `Herdr: ${presentation.description}`,
  };
}

function formatTooltip(availability: HerdrAvailability): string {
  const lines = [
    `**Herdr — ${statusPresentation(availability).description}**`,
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
