import * as vscode from "vscode";
import type { ActiveSessionCreation, CreatedSpace } from "@capabilities/sessions";
import type { NavigationPaneOpening, SpaceSelectionOperations, NavigationContextSource } from "../capabilities";
import { SpacesModel } from "./SpacesModel";
import { VsCodeSpacesView } from "./view";

export class SpacesFeature {
  private readonly model: SpacesModel;
  private readonly view: VsCodeSpacesView;
  private readonly commands: vscode.Disposable;
  private disposed = false;

  constructor(
    context: NavigationContextSource,
    private readonly operations: SpaceSelectionOperations,
    private readonly creation: ActiveSessionCreation,
    private readonly paneOpening: NavigationPaneOpening,
  ) {
    const model = new SpacesModel(context);
    const view = new VsCodeSpacesView(model);
    this.model = model;
    this.view = view;
    this.commands = vscode.Disposable.from(
      vscode.commands.registerCommand("herdr.selectSpace", (spaceId: unknown) => {
        if (typeof spaceId === "string") this.operations.selectSpace(spaceId);
      }),
      vscode.commands.registerCommand("herdr.createSpace", async () => {
        await this.createSpace();
      }),
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.commands.dispose();
    this.view.dispose();
    this.model.dispose();
  }

  private async createSpace(): Promise<void> {
    const state = this.model.getState();
    if (state.kind !== "connected") return;

    const cwd = await this.view.chooseSpaceFolder();
    if (cwd === undefined) return;

    let created: CreatedSpace;
    try {
      created = await this.creation.createSpace({ sessionId: state.sessionId, cwd });
    } catch (error) {
      this.view.showSpaceCreationError(error);
      return;
    }

    this.operations.selectSpace(created.spaceId);
    try {
      this.paneOpening.openPane(created.paneId);
    } catch (error) {
      this.view.showCreatedSpaceOpenError(error);
    }
  }
}
