import * as vscode from "vscode";
import type { Logger } from "./logger";

export class VsCodeLogger implements Logger {
  private readonly output: vscode.LogOutputChannel;

  constructor(name: string) {
    this.output = vscode.window.createOutputChannel(name, { log: true });
  }

  info(message: string): void {
    this.output.info(message);
  }

  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? (error.stack ?? error.message) : error;
    this.output.error(message, detail);
  }

  show(): void {
    this.output.show(true);
  }

  dispose(): void {
    this.output.dispose();
  }
}
