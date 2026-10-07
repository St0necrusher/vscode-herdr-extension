import * as vscode from "vscode";
import type { Logger } from "@core/logger";
import type { TakeoverPluginRegistration } from "@api/herdr";

export class ManageTakeoverPluginFeature implements vscode.Disposable {
  private readonly commands: vscode.Disposable;

  constructor(
    private readonly registration: TakeoverPluginRegistration,
    private readonly logger: Logger,
  ) {
    this.commands = vscode.Disposable.from(
      vscode.commands.registerCommand("herdr.installMobileTakeoverPlugin", () => this.install()),
      vscode.commands.registerCommand("herdr.removeMobileTakeoverPlugin", () => this.remove()),
    );
  }

  dispose(): void {
    this.commands.dispose();
  }

  private async install(): Promise<void> {
    try {
      await this.registration.install();
      await vscode.window.showInformationMessage("Mobile Takeover Plugin installed.");
    } catch (error) {
      await this.showCommandError("install", error);
    }
  }

  private async remove(): Promise<void> {
    try {
      await this.registration.remove();
      await vscode.window.showInformationMessage("Mobile Takeover Plugin removed.");
    } catch (error) {
      await this.showCommandError("remove", error);
    }
  }

  private async showCommandError(operation: string, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(`Could not ${operation} Mobile Takeover Plugin`, error);
    await vscode.window.showErrorMessage(`Could not ${operation} Mobile Takeover Plugin: ${reason}`);
  }
}
