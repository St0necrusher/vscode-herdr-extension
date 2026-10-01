import * as vscode from "vscode";
import type { ActiveSessionCreation, CreatedPane, SplitDirection } from "@capabilities/sessions";
import type { PaneTerminalOpenRequest, PaneTerminalOpening } from "@capabilities/terminalSurfaces";
import type { NavigationContextSource, NavigationPaneOpening } from "../capabilities";
import { paneName, PanesModel } from "./PanesModel";
import { PaneTreeItem, VsCodePanesView } from "./view";

export class PanesFeature implements NavigationPaneOpening {
  private readonly model: PanesModel;
  private readonly view: VsCodePanesView;
  private readonly commands: vscode.Disposable;
  private disposed = false;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly paneTerminalOpening: PaneTerminalOpening,
    private readonly creation: ActiveSessionCreation,
  ) {
    const model = new PanesModel(context);
    let view: VsCodePanesView | undefined;
    try {
      view = new VsCodePanesView(model);
      this.commands = vscode.Disposable.from(
        vscode.commands.registerCommand("herdr.openPane", (paneId: unknown) => {
          if (typeof paneId === "string") {
            const request = this.paneTerminalRequest(paneId);
            if (request !== undefined) this.paneTerminalOpening.openPane(request);
          }
        }),
        vscode.commands.registerCommand("herdr.createPane", async () => {
          await this.createPane();
        }),
        vscode.commands.registerCommand("herdr.splitPaneRight", async (item: unknown) => {
          if (item instanceof PaneTreeItem) await this.splitPane(item.paneId, "right");
        }),
        vscode.commands.registerCommand("herdr.splitPaneDown", async (item: unknown) => {
          if (item instanceof PaneTreeItem) await this.splitPane(item.paneId, "down");
        }),
      );
      this.model = model;
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

  openPane(paneId: string): void {
    const request = this.paneTerminalRequest(paneId);
    if (request === undefined) throw new Error(`Pane ${paneId} is not in the current Session snapshot`);
    this.paneTerminalOpening.openPane(request);
  }

  private async createPane(): Promise<void> {
    const state = this.model.getState();
    if (state.kind !== "connected") return;

    await this.createAndOpenPane(
      this.creation.createPane({ sessionId: state.sessionId, spaceId: state.space.id }),
      (error) => this.view.showPaneCreationError(error),
    );
  }

  private async splitPane(paneId: string, direction: SplitDirection): Promise<void> {
    const state = this.model.getState();
    if (state.kind !== "connected") return;

    await this.createAndOpenPane(this.creation.splitPane({ sessionId: state.sessionId, paneId, direction }), (error) =>
      this.view.showPaneSplitError(error),
    );
  }

  private async createAndOpenPane(
    creation: Promise<CreatedPane>,
    showCreationError: (error: unknown) => void,
  ): Promise<void> {
    let paneId: string;
    try {
      const created = await creation;
      paneId = created.paneId;
    } catch (error) {
      showCreationError(error);
      return;
    }

    try {
      this.openPane(paneId);
    } catch (error) {
      this.view.showCreatedPaneOpenError(error);
    }
  }

  private paneTerminalRequest(paneId: string): PaneTerminalOpenRequest | undefined {
    const state = this.context.getState();
    const hasSnapshot = state.kind === "connected" || state.kind === "stale";
    if (!hasSnapshot) return undefined;

    const pane = state.snapshot.panes.find((candidate) => candidate.id === paneId);
    if (pane === undefined) return undefined;
    return {
      sessionId: state.sessionId,
      paneId: pane.id,
      terminalId: pane.terminalId,
      name: paneName(pane),
    };
  }
}
