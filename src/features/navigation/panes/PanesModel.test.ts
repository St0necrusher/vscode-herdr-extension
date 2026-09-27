import { describe, expect, it } from "vitest";
import type { HerdrAgent, HerdrPane, HerdrSessionSnapshot, HerdrSpace, HerdrTab } from "@capabilities/sessions";
import type { NavigationContextSource, NavigationContextState } from "../capabilities";
import { PanesModel } from "./PanesModel";

function space(id: string, label = id): HerdrSpace {
  return {
    id,
    number: 1,
    label,
    focused: false,
    paneCount: 0,
    tabCount: 0,
    activeHerdrTabId: "",
    agentStatus: "idle",
    tokens: {},
  };
}

function tab(id: string, spaceId: string, label: string, paneCount = 1): HerdrTab {
  return { id, spaceId, number: 1, label, focused: false, paneCount, agentStatus: "idle" };
}

function pane(id: string, tabId: string, spaceId: string, overrides: Partial<HerdrPane> = {}): HerdrPane {
  return {
    id,
    terminalId: `terminal-${id}`,
    spaceId,
    herdrTabId: tabId,
    focused: false,
    agentStatus: "idle",
    revision: 1,
    stateLabels: {},
    tokens: {},
    ...overrides,
  };
}

function agent(paneId: string, tabId: string, spaceId: string, overrides: Partial<HerdrAgent> = {}): HerdrAgent {
  return {
    terminalId: `terminal-${paneId}`,
    agentStatus: "working",
    spaceId,
    herdrTabId: tabId,
    paneId,
    focused: false,
    revision: 1,
    interactiveReady: true,
    launchPending: false,
    screenDetectionSkipped: false,
    stateChangeSequence: 1,
    stateLabels: {},
    tokens: {},
    ...overrides,
  };
}

function snapshot(
  spaces: readonly HerdrSpace[],
  herdrTabs: readonly HerdrTab[],
  panes: readonly HerdrPane[],
  agents: readonly HerdrAgent[],
): HerdrSessionSnapshot {
  return { version: "1", protocol: 1, spaces, herdrTabs, panes, layouts: [], agents };
}

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
      for (const listener of listeners) listener(next);
    },
  };
}

describe("PanesModel", () => {
  it("derives ordered groups, singleton identity, naming, filtering, and freshness", () => {
    const spaceA = space("space-a", "Alpha");
    const spaceB = space("space-b", "Beta");
    const singleTab = tab("tab-single", spaceA.id, "Single Tab");
    const groupTab = tab("tab-group", spaceA.id, "Grouped Tab", 2);
    const titleTab = tab("tab-title", spaceA.id, "Title Tab");
    const fallbackTab = tab("tab-fallback", spaceA.id, "Fallback Tab");
    const foreignTab = tab("tab-foreign", spaceB.id, "Foreign Tab");
    const singlePane = pane("pane-single", singleTab.id, spaceA.id, { label: "Manual Pane" });
    const groupDisplayPane = pane("pane-display", groupTab.id, spaceA.id, { terminalTitle: "⠋ Terminal Name" });
    const groupNamePane = pane("pane-name", groupTab.id, spaceA.id, { label: "Label", terminalTitle: "Title loses" });
    const titlePane = pane("pane-title", titleTab.id, spaceA.id, { terminalTitle: "Terminal Title" });
    const fallbackPane = pane("pane-fallback", fallbackTab.id, spaceA.id);
    const foreignPane = pane("pane-foreign", foreignTab.id, spaceB.id, { label: "Foreign Pane" });
    const panes = [singlePane, groupNamePane, groupDisplayPane, titlePane, fallbackPane, foreignPane];
    const agents = [
      agent(singlePane.id, singleTab.id, spaceA.id, { name: "Agent name is ignored" }),
      agent(fallbackPane.id, fallbackTab.id, spaceA.id, {
        name: "Agent name is ignored",
        title: "Agent title is ignored",
      }),
    ];
    const initialSnapshot = snapshot(
      [spaceA, spaceB],
      [singleTab, groupTab, titleTab, fallbackTab, foreignTab],
      panes,
      agents,
    );
    const harness = contextSource({
      kind: "connected",
      sessionId: "session-1",
      snapshot: initialSnapshot,
      selectedSpaceId: spaceA.id,
    });
    const model = new PanesModel(harness.source);

    const connected = model.getState();
    expect(connected.kind).toBe("connected");
    if (connected.kind !== "connected") throw new Error("expected connected Panes state");
    expect(connected.space).toBe(spaceA);
    expect(connected.items.map((item) => item.kind)).toEqual(["singleton", "group", "singleton", "singleton"]);
    expect(connected.items.map((item) => (item.kind === "group" ? item.tab.id : item.tab.id))).toEqual([
      "tab-single",
      "tab-group",
      "tab-title",
      "tab-fallback",
    ]);

    const singleton = connected.items[0];
    if (singleton?.kind !== "singleton") throw new Error("expected singleton item");
    expect(singleton.pane).toBe(singlePane);
    expect(singleton.tab).toBe(singleTab);
    expect(singleton.name).toBe("Manual Pane");
    expect(singleton.title).toBe("Single Tab");
    expect(singleton.description).toBe("Manual Pane");

    const group = connected.items[1];
    if (group?.kind !== "group") throw new Error("expected grouped item");
    expect(group.tab).toBe(groupTab);
    expect(group.panes.map((row) => row.pane.id)).toEqual(["pane-name", "pane-display"]);
    expect(group.panes.map((row) => row.name)).toEqual(["Label", "⠋ Terminal Name"]);

    const title = connected.items[2];
    if (title?.kind !== "singleton") throw new Error("expected title singleton");
    expect(title.name).toBe("Terminal Title");
    expect(title.title).toBe("Title Tab");
    expect(title.description).toBe("Terminal Title");
    const fallback = connected.items[3];
    if (fallback?.kind !== "singleton") throw new Error("expected fallback singleton");
    expect(fallback.name).toBe("Pane pane-fallback");
    expect(fallback.title).toBe("Fallback Tab");
    expect(fallback.description).toBeUndefined();
    expect(connected.items.some((item) => item.tab.id === foreignTab.id)).toBe(false);

    harness.setState({
      kind: "stale",
      sessionId: "session-1",
      reason: "reconnecting",
      snapshot: initialSnapshot,
      selectedSpaceId: spaceA.id,
    });
    const stale = model.getState();
    expect(stale).toMatchObject({ kind: "stale", reason: "reconnecting", space: spaceA });
    if (stale.kind !== "stale") throw new Error("expected stale Panes state");
    expect(stale.items.map((item) => item.tab.id)).toEqual(["tab-single", "tab-group", "tab-title", "tab-fallback"]);

    const noSpaceSnapshot = snapshot([], [], [], []);
    harness.setState({
      kind: "connected",
      sessionId: "session-1",
      snapshot: noSpaceSnapshot,
    });
    expect(model.getState()).toEqual({
      kind: "no-space",
      sessionId: "session-1",
      freshness: "connected",
    });

    harness.setState({
      kind: "stale",
      sessionId: "session-1",
      reason: "incompatible",
      snapshot: noSpaceSnapshot,
    });
    expect(model.getState()).toEqual({
      kind: "no-space",
      sessionId: "session-1",
      freshness: { kind: "stale", reason: "incompatible" },
    });

    harness.setState({ kind: "unavailable", sessionId: "session-1" });
    expect(model.getState()).toEqual({ kind: "unavailable", sessionId: "session-1" });
    harness.setState({ kind: "unavailable" });
    expect(model.getState()).toEqual({ kind: "unavailable" });

    model.dispose();
  });

  it("names a singleton from its Tab name with the Pane label or terminal name as secondary text", () => {
    const space1 = space("space-1");
    const cases: readonly [label: string, tabName: string, overrides: Partial<HerdrPane>, description?: string][] = [
      ["label equal to Tab name", "Build", { label: "Build", terminalTitle: "⠋ build" }, "Build"],
      ["label different from Tab name", "Build", { label: "Watcher", terminalTitle: "⠋ build" }, "Watcher"],
      [
        "trimmed terminal name equal to Tab name",
        "claude",
        { terminalTitle: "✳ claude", terminalTitleStripped: "claude" },
        "✳ claude",
      ],
      ["no label or terminal name", "Build", {}],
    ];
    for (const [name, tabName, overrides, description] of cases) {
      const singleTab = tab("tab-1", space1.id, tabName);
      const model = new PanesModel(
        contextSource({
          kind: "connected",
          sessionId: "session-1",
          snapshot: snapshot([space1], [singleTab], [pane("pane-1", singleTab.id, space1.id, overrides)], []),
          selectedSpaceId: space1.id,
        }).source,
      );
      const state = model.getState();
      const item = state.kind === "connected" ? state.items[0] : undefined;
      if (item?.kind !== "singleton") throw new Error(`expected singleton for ${name}`);
      expect({ name, title: item.title, description: item.description }).toEqual({ name, title: tabName, description });
      model.dispose();
    }
  });
});
