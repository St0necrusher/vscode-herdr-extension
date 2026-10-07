import type { HerdrAgent, HerdrPane, HerdrSpace, HerdrTab } from "@api/herdr";
import type { NavigationContextSource, NavigationContextState } from "../capabilities";
import { paneName } from "../shared";

export type AgentNavigationRow = Readonly<{
  agent: HerdrAgent;
  pane: HerdrPane;
  space: HerdrSpace;
  tab: HerdrTab;
  label: string;
  paneName: string;
}>;

export type UnavailableAgentsState = Readonly<{
  kind: "unavailable";
  sessionId?: string;
}>;

export type ConnectedAgentsState = Readonly<{
  kind: "connected";
  sessionId: string;
  rows: readonly AgentNavigationRow[];
}>;

export type StaleAgentsState = Readonly<{
  kind: "stale";
  sessionId: string;
  reason: "reconnecting" | "incompatible";
  rows: readonly AgentNavigationRow[];
}>;

export type AgentsState = UnavailableAgentsState | ConnectedAgentsState | StaleAgentsState;

export class AgentsModel {
  private readonly listeners = new Set<(state: AgentsState) => void>();
  private readonly contextSubscription: { dispose(): void };
  private disposed = false;

  constructor(private readonly context: NavigationContextSource) {
    this.contextSubscription = context.onDidChange((state) => {
      if (this.disposed) return;
      const next = this.getState(state);
      for (const listener of [...this.listeners]) listener(next);
    });
  }

  getState(context = this.context.getState()): AgentsState {
    if (context.kind === "unavailable") {
      return context.sessionId === undefined
        ? { kind: "unavailable" }
        : { kind: "unavailable", sessionId: context.sessionId };
    }
    const rows = agentRows(context);
    return context.kind === "connected"
      ? { kind: "connected", sessionId: context.sessionId, rows }
      : { kind: "stale", sessionId: context.sessionId, reason: context.reason, rows };
  }

  onDidChange(listener: (state: AgentsState) => void): { dispose(): void } {
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

// Herdr order. The snapshot decoder guarantees every Agent's Space, Tab, and Pane exist.
function agentRows(context: Exclude<NavigationContextState, { kind: "unavailable" }>): AgentNavigationRow[] {
  const { snapshot } = context;
  return snapshot.agents.flatMap((agent) => {
    const pane = snapshot.panes.find((candidate) => candidate.id === agent.paneId);
    const space = snapshot.spaces.find((candidate) => candidate.id === agent.spaceId);
    const tab = snapshot.herdrTabs.find((candidate) => candidate.id === agent.herdrTabId);
    if (pane === undefined || space === undefined || tab === undefined) return [];
    return [
      {
        agent,
        pane,
        space,
        tab,
        // Herdr lists an Agent only when it has a name or an agent label; "" only satisfies the type.
        label: agent.name ?? agent.displayAgent ?? agent.agent ?? "",
        paneName: paneName(pane),
      },
    ];
  });
}
