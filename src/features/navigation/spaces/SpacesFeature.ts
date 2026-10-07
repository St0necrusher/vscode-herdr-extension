import * as vscode from "vscode";
import type { ActiveSessionCreation, ActiveSessionManagement } from "@modules/sessions";
import type { CreatedSpace, HerdrPane, HerdrSpace } from "@api/herdr";
import type { PaneTerminalClosing } from "@modules/pane-editors";
import type { NavigationPaneOpening, SpaceSelectionOperations, NavigationContextSource } from "../capabilities";
import { SpacesModel, type SpaceNavigationEntry } from "./SpacesModel";
import { SpaceTreeItem, VsCodeSpacesView } from "./view";

export class SpacesFeature {
  private readonly model: SpacesModel;
  private readonly view: VsCodeSpacesView;
  private readonly commands: vscode.Disposable;
  private disposed = false;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly operations: SpaceSelectionOperations,
    private readonly creation: ActiveSessionCreation,
    private readonly paneOpening: NavigationPaneOpening,
    private readonly management: ActiveSessionManagement,
    private readonly paneClosing: PaneTerminalClosing,
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
      vscode.commands.registerCommand("herdr.renameSpace", async (item: unknown) => {
        if (item instanceof SpaceTreeItem) await this.renameSpace(item.spaceId);
      }),
      vscode.commands.registerCommand("herdr.closeSpace", async (item: unknown) => {
        if (item instanceof SpaceTreeItem) await this.closeSpace(item.spaceId);
      }),
      vscode.commands.registerCommand("herdr.closeGroup", async (item: unknown) => {
        if (item instanceof SpaceTreeItem) await this.closeGroup(item.spaceId);
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

  private async renameSpace(spaceId: string): Promise<void> {
    const target = this.findSpace(spaceId);
    if (target === undefined) return;

    const label = await this.view.promptSpaceName(target.space.label);
    if (label === undefined) return;

    try {
      await this.management.renameSpace({ sessionId: target.sessionId, spaceId, label });
    } catch (error) {
      this.view.showSpaceRenameError(error);
    }
  }

  private async closeSpace(spaceId: string): Promise<void> {
    const target = this.findSpace(spaceId);
    if (target === undefined) return;

    const confirmed = await this.view.confirmCloseSpace(target.space);
    if (!confirmed) return;

    await this.close(target, [target.space], false, (error) => this.view.showSpaceCloseError(error));
  }

  private async closeGroup(spaceId: string): Promise<void> {
    const target = this.findSpace(spaceId);
    if (target === undefined) return;
    const members = target.worktreeGroup;
    if (members === undefined) return;

    const confirmed = await this.view.confirmCloseGroup(target.space, members);
    if (!confirmed) return;

    await this.close(target, members, true, (error) => this.view.showGroupCloseError(error));
  }

  // Captures the Panes before closing, so their editors close only after Herdr confirms.
  private async close(
    target: SpaceTarget,
    closedSpaces: readonly HerdrSpace[],
    closeGroup: boolean,
    showError: (error: unknown) => void,
  ): Promise<void> {
    const closedSpaceIds = new Set(closedSpaces.map((space) => space.id));
    const paneIds = target.panes.filter((pane) => closedSpaceIds.has(pane.spaceId)).map((pane) => pane.id);
    try {
      await this.management.closeSpace({ sessionId: target.sessionId, spaceId: target.space.id, closeGroup });
    } catch (error) {
      showError(error);
      return;
    }

    this.paneClosing.closePanes(target.sessionId, paneIds);
  }

  private findSpace(spaceId: string): SpaceTarget | undefined {
    const context = this.context.getState();
    const state = this.model.getState(context);
    const isConnected = context.kind === "connected" && state.kind === "connected";
    if (!isConnected) return undefined;

    const entry = state.spaces.find((candidate) => candidate.space.id === spaceId);
    if (entry === undefined) return undefined;
    return { ...entry, sessionId: state.sessionId, panes: context.snapshot.panes };
  }
}

type SpaceTarget = SpaceNavigationEntry & Readonly<{ sessionId: string; panes: readonly HerdrPane[] }>;
