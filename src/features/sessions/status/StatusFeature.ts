import * as vscode from "vscode";
import type { HerdrConfigurationActions } from "@capabilities/sessions";
import type { HerdrLogger } from "@capabilities/runtime";
import type { SessionsOperations, SessionsStateSource } from "../capabilities";
import { statusModel } from "./statusModel";
import { VsCodeStatusView } from "./view/VsCodeStatusView";

export class StatusFeature {
  private readonly view: VsCodeStatusView;
  private readonly subscription: { dispose(): void };
  private readonly commands: { dispose(): void };
  private readonly logger: HerdrLogger;
  private disposed = false;

  constructor(
    private readonly source: SessionsStateSource,
    private readonly operations: SessionsOperations,
    private readonly configurationActions: HerdrConfigurationActions,
    logger: HerdrLogger,
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
        registrations.push(
          vscode.commands.registerCommand("herdr.selectExecutable", () => configurationActions.selectExecutable()),
        );
        registrations.push(
          vscode.commands.registerCommand("herdr.openSettings", () => configurationActions.openSettings()),
        );
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
    if (this.isDisposed() || action === undefined) return;
    switch (action) {
      case "start":
        await this.operations.startSelectedSession();
        break;
      case "retry":
        await this.operations.retry();
        break;
      case "select-executable":
        await this.configurationActions.selectExecutable();
        break;
      case "open-settings":
        await this.configurationActions.openSettings();
        break;
      case "show-diagnostics":
        this.logger.show();
        break;
    }
  }

  private isDisposed(): boolean {
    return this.disposed;
  }
}
