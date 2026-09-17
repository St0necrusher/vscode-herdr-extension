import * as vscode from "vscode";
import type {
  HerdrCommandHandlers,
  HerdrCommandRegistry,
} from "#capabilities/sessions";

export class VsCodeHerdrCommandRegistry implements HerdrCommandRegistry {
  register(handlers: HerdrCommandHandlers): { dispose(): void } {
    return vscode.Disposable.from(
      vscode.commands.registerCommand("herdr.showStatusActions", () =>
        handlers.showStatusActions(),
      ),
      vscode.commands.registerCommand("herdr.retryDiscovery", () =>
        handlers.retryDiscovery(),
      ),
      vscode.commands.registerCommand("herdr.start", () => handlers.start()),
      vscode.commands.registerCommand("herdr.selectExecutable", () =>
        handlers.selectExecutable(),
      ),
      vscode.commands.registerCommand("herdr.openSettings", () =>
        handlers.openSettings(),
      ),
    );
  }
}
