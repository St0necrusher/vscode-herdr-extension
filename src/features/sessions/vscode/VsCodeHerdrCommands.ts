import * as vscode from "vscode";
import type { HerdrConfigurationActions } from "#capabilities/sessions";
import type {
  HerdrSessionCatalogOperations,
  HerdrStatusOperations,
} from "../capabilities/index.js";

export class VsCodeHerdrCommands {
  private registration: vscode.Disposable | undefined;

  constructor(
    private readonly catalog: HerdrSessionCatalogOperations,
    private readonly status: HerdrStatusOperations,
    private readonly configurationActions: HerdrConfigurationActions,
  ) {}

  register(): void {
    const { catalog, status, configurationActions } = this;
    const registrations: vscode.Disposable[] = [];

    try {
      registrations.push(
        vscode.commands.registerCommand("herdr.showStatusActions", () =>
          status.showActions(),
        ),
      );
      registrations.push(
        vscode.commands.registerCommand("herdr.retryDiscovery", () =>
          catalog.retry(),
        ),
      );
      registrations.push(
        vscode.commands.registerCommand("herdr.start", () => catalog.start()),
      );
      registrations.push(
        vscode.commands.registerCommand("herdr.selectExecutable", () =>
          configurationActions.selectExecutable(),
        ),
      );
      registrations.push(
        vscode.commands.registerCommand("herdr.openSettings", () =>
          configurationActions.openSettings(),
        ),
      );
      this.registration = vscode.Disposable.from(...registrations);
    } catch (error) {
      vscode.Disposable.from(...registrations).dispose();
      throw error;
    }
  }

  dispose(): void {
    this.registration?.dispose();
    this.registration = undefined;
  }
}
