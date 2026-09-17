import * as vscode from "vscode";
import type {
  HerdrCommandHandlers,
  HerdrCommandRegistry,
} from "../capabilities/index.js";

export class VsCodeHerdrCommandRegistry implements HerdrCommandRegistry {
  register(handlers: HerdrCommandHandlers): { dispose(): void } {
    const registrations: vscode.Disposable[] = [];

    try {
      registrations.push(
        vscode.commands.registerCommand("herdr.showStatusActions", () =>
          handlers.showStatusActions(),
        ),
      );
      registrations.push(
        vscode.commands.registerCommand("herdr.retryDiscovery", () =>
          handlers.retryDiscovery(),
        ),
      );
      registrations.push(
        vscode.commands.registerCommand("herdr.start", () => handlers.start()),
      );
      registrations.push(
        vscode.commands.registerCommand("herdr.selectExecutable", () =>
          handlers.selectExecutable(),
        ),
      );
      registrations.push(
        vscode.commands.registerCommand("herdr.openSettings", () =>
          handlers.openSettings(),
        ),
      );
      return vscode.Disposable.from(...registrations);
    } catch (error) {
      vscode.Disposable.from(...registrations).dispose();
      throw error;
    }
  }
}
