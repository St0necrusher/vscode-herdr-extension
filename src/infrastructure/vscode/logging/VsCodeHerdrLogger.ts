import * as vscode from "vscode";
import type { HerdrLogger } from "../../../capabilities/runtime/index.js";

export class VsCodeHerdrLogger implements HerdrLogger {
  readonly #output = vscode.window.createOutputChannel("Herdr", { log: true });

  info(message: string): void {
    this.#output.info(message);
  }

  error(message: string, error?: unknown): void {
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : error;
    this.#output.error(message, detail);
  }

  show(): void {
    this.#output.show(true);
  }

  dispose(): void {
    this.#output.dispose();
  }
}
