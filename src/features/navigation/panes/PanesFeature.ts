import * as vscode from "vscode";
import type {
  ActiveSessionCreation,
  ActiveSessionManagement,
  CreatedPane,
  SplitDirection,
} from "@capabilities/sessions";
import type { PaneTerminalClosing, PaneTerminalOpenRequest, PaneTerminalOpening } from "@capabilities/terminalSurfaces";
import type { NavigationContextSource, NavigationPaneOpening } from "../capabilities";
import { paneName } from "../shared";
import { PanesModel, tabInsertIndex, type PaneNavigationItem, type PaneNavigationRow } from "./PanesModel";
import { PaneTreeItem, PanesGroupTreeItem, VsCodePanesView } from "./view";

export class PanesFeature implements NavigationPaneOpening {
  private readonly model: PanesModel;
  private readonly view: VsCodePanesView;
  private readonly commands: vscode.Disposable;
  private disposed = false;

  constructor(
    private readonly context: NavigationContextSource,
    private readonly paneTerminalOpening: PaneTerminalOpening,
    private readonly creation: ActiveSessionCreation,
    private readonly management: ActiveSessionManagement,
    private readonly paneClosing: PaneTerminalClosing,
  ) {
    const model = new PanesModel(context);
    let view: VsCodePanesView | undefined;
    try {
      view = new VsCodePanesView(model, (tabId, targetTabId) => this.moveTab(tabId, targetTabId));
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
        vscode.commands.registerCommand("herdr.renamePane", async (item: unknown) => {
          if (item instanceof PaneTreeItem) await this.renamePane(item.paneId);
        }),
        vscode.commands.registerCommand("herdr.renameTab", async (item: unknown) => {
          if (item instanceof PanesGroupTreeItem) await this.renameTab(item.group.tab.id);
          else if (item instanceof PaneTreeItem) await this.renameTab(item.tabId);
        }),
        vscode.commands.registerCommand("herdr.closePane", async (item: unknown) => {
          if (item instanceof PaneTreeItem) await this.closePane(item.paneId);
        }),
        vscode.commands.registerCommand("herdr.closeTab", async (item: unknown) => {
          if (item instanceof PanesGroupTreeItem) await this.closeTab(item.group.tab.id);
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

  private async renamePane(paneId: string): Promise<void> {
    const state = this.model.getState();
    if (state.kind !== "connected") return;

    const row = findPaneRow(state.items, paneId);
    if (row === undefined) return;

    const name = await this.view.promptPaneName(row.pane.label ?? "");
    if (name === undefined) return;
    const label = name.trim().length === 0 ? null : name;

    try {
      await this.management.renamePane({ sessionId: state.sessionId, paneId, label });
    } catch (error) {
      this.view.showPaneRenameError(error);
    }
  }

  private async renameTab(tabId: string): Promise<void> {
    const state = this.model.getState();
    if (state.kind !== "connected") return;

    const item = state.items.find((candidate) => candidate.tab.id === tabId);
    if (item === undefined) return;

    const label = await this.view.promptTabName(item.tab.label);
    if (label === undefined) return;

    try {
      await this.management.renameTab({ sessionId: state.sessionId, tabId, label });
    } catch (error) {
      this.view.showTabRenameError(error);
    }
  }

  private async moveTab(tabId: string, targetTabId: string | undefined): Promise<void> {
    const state = this.model.getState();
    if (state.kind !== "connected") return;

    const insertIndex = tabInsertIndex(
      state.items.map((item) => item.tab.id),
      tabId,
      targetTabId,
    );
    if (insertIndex === undefined) return;

    try {
      await this.management.moveTab({ sessionId: state.sessionId, tabId, insertIndex });
    } catch (error) {
      this.view.showTabMoveError(error);
    }
  }

  private async closePane(paneId: string): Promise<void> {
    const state = this.model.getState();
    if (state.kind !== "connected") return;

    // The snapshot may have changed since the menu rendered; never close the last Pane (ADR 0005).
    const row = findPaneRow(state.items, paneId);
    if (row?.closable !== true) return;

    try {
      await this.management.closePane({ sessionId: state.sessionId, paneId });
    } catch (error) {
      this.view.showPaneCloseError(error);
      return;
    }

    this.paneClosing.closePanes(state.sessionId, [paneId]);
  }

  private async closeTab(tabId: string): Promise<void> {
    const state = this.model.getState();
    if (state.kind !== "connected") return;

    // The snapshot may have changed since the menu rendered; never close the last Tab (ADR 0005).
    const item = state.items.find((candidate) => candidate.tab.id === tabId);
    const isClosableGroup = item?.kind === "group" && item.closable;
    if (!isClosableGroup) return;

    const paneIds = item.panes.map((row) => row.pane.id);
    try {
      await this.management.closeTab({ sessionId: state.sessionId, tabId });
    } catch (error) {
      this.view.showTabCloseError(error);
      return;
    }

    this.paneClosing.closePanes(state.sessionId, paneIds);
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

function findPaneRow(items: readonly PaneNavigationItem[], paneId: string): PaneNavigationRow | undefined {
  const rows = items.flatMap((item) => (item.kind === "group" ? item.panes : [item]));
  return rows.find((row) => row.pane.id === paneId);
}
