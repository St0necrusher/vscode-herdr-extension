import * as vscode from "vscode";
import type { ConfigureExecutableFeature } from "@features/configure-executable";
import type { Logger } from "@core/logger";
import type { SessionsOperations, SessionsStateSource } from "@modules/sessions";
import { statusModel } from "./statusModel";
import { VsCodeStatusView } from "./VsCodeStatusView";

export class ConnectionStatus {
  private readonly view: VsCodeStatusView;
  private readonly subscription: { dispose(): void };
  private readonly commands: { dispose(): void };
  private readonly logger: Logger;
  private disposed = false;

  constructor(
    private readonly source: SessionsStateSource,
    private readonly operations: SessionsOperations,
    private readonly configureExecutable: Pick<ConfigureExecutableFeature, "selectExecutable">,
    logger: Logger,
  ) {
    this.logger = logger;
    const view = new VsCodeStatusView(logger);
    let subscription: { dispose(): void } | undefined;
    let commands: { dispose(): void } | undefined;
    try {
      subscription = source.onDidChange((state) => {
        try {
          view.render(statusModel(state));
        } catch (error) {
          logger.error("Herdr status presentation failed.", error);
        }
      });
      view.render(statusModel(source.getState()));
      const registrations: vscode.Disposable[] = [];
      try {
        registrations.push(vscode.commands.registerCommand("herdr.showStatusActions", () => this.showActions()));
        registrations.push(vscode.commands.registerCommand("herdr.start", () => operations.startSelectedSession()));
        registrations.push(vscode.commands.registerCommand("herdr.retryDiscovery", () => operations.retry()));
        registrations.push(vscode.commands.registerCommand("herdr.openSettings", () => this.openSettings()));
        commands = vscode.Disposable.from(...registrations);
      } catch (error) {
        vscode.Disposable.from(...registrations).dispose();
        throw error;
      }
      this.view = view;
      this.subscription = subscription;
      this.commands = commands;
    } catch (error) {
      commands?.dispose();
      subscription?.dispose();
      view.dispose();
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.subscription.dispose();
    this.commands.dispose();
    this.view.dispose();
  }

  private async showActions(): Promise<void> {
    if (this.disposed) return;
    const action = await this.view.chooseAction(statusModel(this.source.getState()));
    const cannotRunAction = this.isDisposed() || action === undefined;
    if (cannotRunAction) return;
    switch (action) {
      case "start":
        await this.operations.startSelectedSession();
        break;
      case "retry":
        await this.operations.retry();
        break;
      case "select-executable":
        await this.configureExecutable.selectExecutable();
        break;
      case "open-settings":
        await this.openSettings();
        break;
      case "show-diagnostics":
        this.logger.show();
        break;
    }
  }

  private async openSettings(): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:St0necrusher.vscode-herdr-extension");
  }

  private isDisposed(): boolean {
    return this.disposed;
  }
}
