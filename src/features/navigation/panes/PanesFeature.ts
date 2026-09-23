import * as vscode from "vscode";
import type { PaneTerminalOpening } from "@capabilities/terminalSurfaces";
import type { NavigationContextSource } from "../capabilities";
import { PanesModel } from "./PanesModel";
import { VsCodePanesView } from "./view";

export class PanesFeature {
  private readonly model: PanesModel;
  private readonly view: VsCodePanesView;
  private readonly commands: vscode.Disposable;
  private readonly paneTerminalOpening: PaneTerminalOpening;
  private disposed = false;

  constructor(context: NavigationContextSource, paneTerminalOpening: PaneTerminalOpening) {
    const model = new PanesModel(context);
    let view: VsCodePanesView | undefined;
    try {
      view = new VsCodePanesView(model);
      this.model = model;
      this.paneTerminalOpening = paneTerminalOpening;
      this.commands = vscode.commands.registerCommand("herdr.openPane", (paneId: unknown) => this.openPane(paneId));
      this.view = view;
    } catch (error) {
      view?.dispose();
      model.dispose();
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.commands.dispose();
    this.view.dispose();
    this.model.dispose();
  }

  private openPane(paneId: unknown): void {
    if (typeof paneId !== "string") return;
    const state = this.model.getState();
    if (state.kind !== "connected" && state.kind !== "stale") return;
    const rows = state.items.flatMap((item) => (item.kind === "group" ? item.panes : [item]));
    const row = rows.find((candidate) => candidate.pane.id === paneId);
    if (row === undefined) return;
    this.paneTerminalOpening.openPane({
      sessionId: state.sessionId,
      paneId: row.pane.id,
      terminalId: row.pane.terminalId,
      name: row.name,
    });
  }
}
