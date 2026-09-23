import * as vscode from "vscode";
import type { SpaceSelectionOperations, NavigationContextSource } from "../capabilities";
import { SpacesModel } from "./SpacesModel";
import { VsCodeSpacesView } from "./view";

export class SpacesFeature {
  private readonly model: SpacesModel;
  private readonly view: VsCodeSpacesView;
  private readonly command: vscode.Disposable;
  private disposed = false;

  constructor(context: NavigationContextSource, operations: SpaceSelectionOperations) {
    const model = new SpacesModel(context);
    const view = new VsCodeSpacesView(model);
    this.model = model;
    this.view = view;
    this.command = vscode.commands.registerCommand("herdr.selectSpace", (spaceId: unknown) => {
      if (typeof spaceId === "string") operations.selectSpace(spaceId);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.command.dispose();
    this.view.dispose();
    this.model.dispose();
  }
}
