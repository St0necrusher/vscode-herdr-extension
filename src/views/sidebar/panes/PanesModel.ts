import type { HerdrPane, HerdrSpace, HerdrTab } from "@api/herdr";
import type { NavigationContextSource } from "@modules/workspace-context";
import { paneName, isPaneClosable, isTabClosable } from "@modules/sessions";

export type PaneNavigationRow = Readonly<{
  pane: HerdrPane;
  tab: HerdrTab;
  name: string;
  closable: boolean;
}>;

export type PaneNavigationGroup = Readonly<{
  kind: "group";
  tab: HerdrTab;
  panes: readonly PaneNavigationRow[];
  closable: boolean;
}>;

export type PaneNavigationSingleton = PaneNavigationRow &
  Readonly<{
    kind: "singleton";
    title: string;
    description?: string;
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
    const paneClosable = isPaneClosable(panes);
    const tabClosable = isTabClosable(tabs);
    const items: PaneNavigationItem[] = [];
    tabs.forEach((tab) => {
      const tabPanes = panes
        .filter((pane) => pane.herdrTabId === tab.id)
        .map((pane) => paneRow(pane, tab, paneClosable));
      if (tabPanes.length > 1) items.push({ kind: "group", tab, panes: tabPanes, closable: tabClosable });
      else if (tabPanes.length === 1) {
        const singleton = tabPanes[0];
        if (singleton !== undefined) items.push(singletonItem(singleton));
      }
    });
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

// The dragged Tab takes the target's place; no target means the end. Herdr counts the insert index as a gap
// in the order before the move, so a Tab moving down is inserted one past its target.
export function tabInsertIndex(
  tabIds: readonly string[],
  tabId: string,
  targetTabId: string | undefined,
): number | undefined {
  const from = tabIds.indexOf(tabId);
  const to = targetTabId === undefined ? tabIds.length - 1 : tabIds.indexOf(targetTabId);
  const bothShown = from !== -1 && to !== -1;
  const changesOrder = bothShown && from !== to;
  if (!changesOrder) return undefined;
  return from < to ? to + 1 : to;
}

function paneRow(pane: HerdrPane, tab: HerdrTab, closable: boolean): PaneNavigationRow {
  return { pane, tab, name: paneName(pane), closable };
}

function singletonItem(row: PaneNavigationRow): PaneNavigationSingleton {
  const paneName = nonEmpty(row.pane.label) ?? nonEmpty(row.pane.terminalTitle);
  return paneName === undefined
    ? { ...row, kind: "singleton", title: row.tab.label }
    : { ...row, kind: "singleton", title: row.tab.label, description: paneName };
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}
