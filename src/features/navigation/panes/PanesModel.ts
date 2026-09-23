import type { HerdrAgent, HerdrPane, HerdrSpace, HerdrTab } from "@capabilities/sessions";
import type { NavigationContextSource } from "../capabilities";

export type PaneNavigationRow = Readonly<{
  pane: HerdrPane;
  tab: HerdrTab;
  name: string;
}>;

export type PaneNavigationGroup = Readonly<{
  kind: "group";
  tab: HerdrTab;
  panes: readonly PaneNavigationRow[];
}>;

export type PaneNavigationSingleton = PaneNavigationRow &
  Readonly<{
    kind: "singleton";
  }>;

export type PaneNavigationItem = PaneNavigationGroup | PaneNavigationSingleton;

export type UnavailablePanesState = Readonly<{
  kind: "unavailable";
  sessionId?: string;
}>;

export type ConnectedPanesState = Readonly<{
  kind: "connected";
  sessionId: string;
  space: HerdrSpace;
  items: readonly PaneNavigationItem[];
}>;

export type StalePanesState = Readonly<{
  kind: "stale";
  sessionId: string;
  reason: "reconnecting" | "incompatible";
  space: HerdrSpace;
  items: readonly PaneNavigationItem[];
}>;

type ConnectedPanesFreshness = "connected";
type StalePanesFreshness = Readonly<{
  kind: "stale";
  reason: "reconnecting" | "incompatible";
}>;
type PanesFreshness = ConnectedPanesFreshness | StalePanesFreshness;

export type NoSpacePanesState = Readonly<{
  kind: "no-space";
  sessionId: string;
  freshness: PanesFreshness;
}>;

export type PanesState = UnavailablePanesState | NoSpacePanesState | ConnectedPanesState | StalePanesState;

export class PanesModel {
  private readonly listeners = new Set<(state: PanesState) => void>();
  private readonly contextSubscription: { dispose(): void };
  private disposed = false;

  constructor(private readonly context: NavigationContextSource) {
    this.contextSubscription = context.onDidChange((state) => {
      if (this.disposed) return;
      const next = this.getState(state);
      for (const listener of [...this.listeners]) listener(next);
    });
  }

  getState(context = this.context.getState()): PanesState {
    if (context.kind === "unavailable") {
      return context.sessionId === undefined
        ? { kind: "unavailable" }
        : { kind: "unavailable", sessionId: context.sessionId };
    }
    const selectedSpaceId = context.selectedSpaceId;
    const freshness: PanesFreshness =
      context.kind === "connected" ? "connected" : { kind: "stale", reason: context.reason };
    if (selectedSpaceId === undefined) return { kind: "no-space", sessionId: context.sessionId, freshness };
    const space = context.snapshot.spaces.find((candidate) => candidate.id === selectedSpaceId);
    if (space === undefined) return { kind: "no-space", sessionId: context.sessionId, freshness };

    const tabs = context.snapshot.herdrTabs.filter((tab) => tab.spaceId === selectedSpaceId);
    const panes = context.snapshot.panes.filter((pane) => pane.spaceId === selectedSpaceId);
    const items: PaneNavigationItem[] = [];
    for (const tab of tabs) {
      const tabPanes = panes
        .filter((pane) => pane.herdrTabId === tab.id)
        .map((pane) => paneRow(pane, tab, context.snapshot.agents));
      if (tabPanes.length > 1) items.push({ kind: "group", tab, panes: tabPanes });
      else if (tabPanes.length === 1) {
        const singleton = tabPanes[0];
        if (singleton !== undefined) items.push({ ...singleton, kind: "singleton" });
      }
    }
    return context.kind === "connected"
      ? { kind: "connected", sessionId: context.sessionId, space, items }
      : { kind: "stale", sessionId: context.sessionId, reason: context.reason, space, items };
  }

  onDidChange(listener: (state: PanesState) => void): { dispose(): void } {
    if (this.disposed) return { dispose: () => undefined };
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.contextSubscription.dispose();
    this.listeners.clear();
  }
}

function paneRow(pane: HerdrPane, tab: HerdrTab, agents: readonly HerdrAgent[]): PaneNavigationRow {
  const agent = agents.find((candidate) => candidate.paneId === pane.id);
  return { pane, tab, name: paneName(pane, agent) };
}

function paneName(pane: HerdrPane, agent: HerdrAgent | undefined): string {
  return (
    nonEmpty(pane.label) ??
    nonEmpty(agent?.name) ??
    nonEmpty(agent?.displayAgent) ??
    nonEmpty(agent?.title) ??
    `Pane ${pane.id}`
  );
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}
