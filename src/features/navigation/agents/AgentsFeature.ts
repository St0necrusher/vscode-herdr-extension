import * as vscode from "vscode";
import type {
  NavigationContextSource,
  SpaceSelectionOperations,
  VisiblePaneEditorsSource,
} from "@modules/workspace-context";
import type { NavigationPaneOpening } from "../capabilities";
import { AgentsModel } from "./AgentsModel";
import { VsCodeAgentsView } from "./view";

export class AgentsFeature {
  private readonly model: AgentsModel;
  private readonly view: VsCodeAgentsView;
  private readonly commands: vscode.Disposable;
  private disposed = false;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly spaceSelection: SpaceSelectionOperations,
    private readonly paneOpening: NavigationPaneOpening,
    paneEditors: VisiblePaneEditorsSource,
  ) {
    this.model = new AgentsModel(context);
    this.view = new VsCodeAgentsView(this.model, paneEditors);
    this.commands = vscode.commands.registerCommand("herdr.openAgentPane", (paneId: unknown) => {
      if (typeof paneId === "string") this.openAgentPane(paneId);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.commands.dispose();
    this.view.dispose();
    this.model.dispose();
  }

  // Navigation only: nothing about the Agent is sent to Herdr, and Herdr focus never changes.
  private openAgentPane(paneId: string): void {
    const state = this.context.getState();
    if (state.kind === "unavailable") return;
    const pane = state.snapshot.panes.find((candidate) => candidate.id === paneId);
    if (pane === undefined) return;

    this.spaceSelection.selectSpace(pane.spaceId);
    this.paneOpening.openPane(paneId);
  }
}
