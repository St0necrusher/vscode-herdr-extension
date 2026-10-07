import { describe, expect, it } from "vitest";
import type { HerdrSessionSnapshot } from "../../../api/herdr/shared/types";
import type { NavigationContextSource, NavigationContextState } from "@modules/workspace-context";
import { AgentsModel } from "./AgentsModel";
import type { AgentsState } from "./AgentsModel";

const snapshot: HerdrSessionSnapshot = {
  version: "1",
  protocol: 1,
  spaces: [
    {
      id: "space-a",
      number: 1,
      label: "Alpha",
      focused: false,
      paneCount: 2,
      tabCount: 1,
      activeHerdrTabId: "tab-a",
      agentStatus: "working",
      tokens: {},
    },
    {
      id: "space-b",
      number: 2,
      label: "Beta",
      focused: false,
      paneCount: 1,
      tabCount: 1,
      activeHerdrTabId: "tab-b",
      agentStatus: "working",
      tokens: {},
    },
  ],
  herdrTabs: [
    {
      id: "tab-a",
      spaceId: "space-a",
      number: 1,
      label: "Alpha Tab",
      focused: false,
      paneCount: 2,
      agentStatus: "working",
    },
    {
      id: "tab-b",
      spaceId: "space-b",
      number: 1,
      label: "Beta Tab",
      focused: false,
      paneCount: 1,
      agentStatus: "working",
    },
  ],
  panes: [
    {
      id: "pane-a-2",
      terminalId: "terminal-a-2",
      spaceId: "space-a",
      herdrTabId: "tab-a",
      label: "Review Pane",
      focused: false,
      agentStatus: "working",
      revision: 1,
      stateLabels: {},
      tokens: {},
    },
    {
      id: "pane-a-1",
      terminalId: "terminal-a-1",
      spaceId: "space-a",
      herdrTabId: "tab-a",
      label: "Build Pane",
      focused: false,
      agentStatus: "working",
      revision: 1,
      stateLabels: {},
      tokens: {},
    },
    {
      id: "pane-b-1",
      terminalId: "terminal-b-1",
      spaceId: "space-b",
      herdrTabId: "tab-b",
      label: "Named Pane",
      terminalTitle: "Terminal title loses",
      focused: false,
      agentStatus: "working",
      revision: 1,
      stateLabels: {},
      tokens: {},
    },
  ],
  layouts: [],
  agents: [
    {
      terminalId: "terminal-b-1",
      paneId: "pane-b-1",
      spaceId: "space-b",
      herdrTabId: "tab-b",
      name: "Named Agent",
      displayAgent: "Display label loses",
      agent: "claude",
      focused: false,
      agentStatus: "working",
      revision: 1,
      interactiveReady: true,
      launchPending: false,
      screenDetectionSkipped: false,
      stateChangeSequence: 1,
      stateLabels: {},
      tokens: {},
    },
    {
      terminalId: "terminal-a-1",
      paneId: "pane-a-1",
      spaceId: "space-a",
      herdrTabId: "tab-a",
      displayAgent: "Display Agent",
      agent: "codex",
      focused: false,
      agentStatus: "working",
      revision: 1,
      interactiveReady: true,
      launchPending: false,
      screenDetectionSkipped: false,
      stateChangeSequence: 1,
      stateLabels: {},
      tokens: {},
    },
    {
      terminalId: "terminal-a-2",
      paneId: "pane-a-2",
      spaceId: "space-a",
      herdrTabId: "tab-a",
      agent: "gemini",
      focused: false,
      agentStatus: "working",
      revision: 1,
      interactiveReady: true,
      launchPending: false,
      screenDetectionSkipped: false,
      stateChangeSequence: 1,
      stateLabels: {},
      tokens: {},
    },
  ],
};

function contextSource(initial: NavigationContextState): {
  source: NavigationContextSource;
  setState(next: NavigationContextState): void;
} {
  let state = initial;
  const listeners = new Set<(next: NavigationContextState) => void>();
  return {
    source: {
      getState: () => state,
      onDidChange: (listener) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
    },
    setState: (next) => {
      state = next;
      listeners.forEach((listener) => listener(next));
    },
  };
}

describe("AgentsModel", () => {
  it("derives Agent rows across Spaces in Herdr order and publishes changed Agent Status", () => {
    const harness = contextSource({
      kind: "connected",
      sessionId: "session-1",
      snapshot,
      selectedSpaceId: "space-a",
    });
    const model = new AgentsModel(harness.source);
    const changes: AgentsState[] = [];
    model.onDidChange((state) => changes.push(state));

    const connected = model.getState();
    expect(connected).toMatchObject({ kind: "connected", sessionId: "session-1" });
    if (connected.kind !== "connected") throw new Error("expected connected Agents state");
    expect(
      connected.rows.map((row) => ({
        paneId: row.pane.id,
        label: row.label,
        space: [row.space.id, row.space.label],
        herdrTab: [row.tab.id, row.tab.label],
        paneName: row.paneName,
        agentStatus: row.agent.agentStatus,
      })),
    ).toEqual([
      {
        paneId: "pane-b-1",
        label: "Named Agent",
        space: ["space-b", "Beta"],
        herdrTab: ["tab-b", "Beta Tab"],
        paneName: "Named Pane",
        agentStatus: "working",
      },
      {
        paneId: "pane-a-1",
        label: "Display Agent",
        space: ["space-a", "Alpha"],
        herdrTab: ["tab-a", "Alpha Tab"],
        paneName: "Build Pane",
        agentStatus: "working",
      },
      {
        paneId: "pane-a-2",
        label: "gemini",
        space: ["space-a", "Alpha"],
        herdrTab: ["tab-a", "Alpha Tab"],
        paneName: "Review Pane",
        agentStatus: "working",
      },
    ]);

    harness.setState({
      kind: "connected",
      sessionId: "session-1",
      selectedSpaceId: "space-a",
      snapshot: {
        ...snapshot,
        agents: snapshot.agents.map((agent) =>
          agent.paneId === "pane-b-1" ? { ...agent, agentStatus: "blocked" } : agent,
        ),
      },
    });
    const changed = changes.at(-1);
    expect(changed).toMatchObject({ kind: "connected", sessionId: "session-1" });
    if (changed?.kind !== "connected") throw new Error("expected published connected Agents state");
    expect(changed.rows.map((row) => [row.pane.id, row.agent.agentStatus])).toEqual([
      ["pane-b-1", "blocked"],
      ["pane-a-1", "working"],
      ["pane-a-2", "working"],
    ]);

    model.dispose();
  });

  it("keeps Agent rows and the reason for a stale Session and has no rows when unavailable", () => {
    const harness = contextSource({ kind: "connected", sessionId: "session-1", snapshot, selectedSpaceId: "space-a" });
    const model = new AgentsModel(harness.source);

    harness.setState({
      kind: "stale",
      sessionId: "session-1",
      reason: "reconnecting",
      snapshot,
      selectedSpaceId: "space-a",
    });
    const stale = model.getState();
    expect(stale).toMatchObject({ kind: "stale", sessionId: "session-1", reason: "reconnecting" });
    if (stale.kind !== "stale") throw new Error("expected stale Agents state");
    expect(stale.rows.map((row) => row.pane.id)).toEqual(["pane-b-1", "pane-a-1", "pane-a-2"]);

    harness.setState({ kind: "unavailable", sessionId: "session-1" });
    expect(model.getState()).toEqual({ kind: "unavailable", sessionId: "session-1" });

    model.dispose();
  });
});
