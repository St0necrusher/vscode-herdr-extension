import { describe, expect, it } from "vitest";
import type {
  ActiveSessionProjectionSource,
  ActiveSessionProjectionState,
  HerdrSessionSnapshot,
} from "@capabilities/sessions";
import type { PaneEditorPresence, PaneEditorPresenceSource } from "@capabilities/terminalSurfaces";
import { NavigationContextModel } from "./NavigationContextModel";
import type { NavigationContextState } from "./capabilities";

function snapshot(spaceIds: readonly string[], focusedSpaceId?: string): HerdrSessionSnapshot {
  const spaces = spaceIds.map((id, index) => ({
    id,
    number: index + 1,
    label: `Space ${id}`,
    focused: id === focusedSpaceId,
    paneCount: 1,
    tabCount: 1,
    activeHerdrTabId: `tab-${id}`,
    agentStatus: "idle" as const,
    tokens: {},
  }));
  return {
    version: "1",
    protocol: 1,
    spaces,
    herdrTabs: spaceIds.map((id) => ({
      id: `tab-${id}`,
      spaceId: id,
      number: 1,
      label: `Herdr Tab ${id}`,
      focused: id === focusedSpaceId,
      paneCount: 1,
      agentStatus: "idle" as const,
    })),
    panes: spaceIds.map((id) => ({
      id: `pane-${id}`,
      terminalId: `terminal-${id}`,
      spaceId: id,
      herdrTabId: `tab-${id}`,
      focused: id === focusedSpaceId,
      agentStatus: "idle" as const,
      revision: 1,
      stateLabels: {},
      tokens: {},
    })),
    layouts: [],
    agents: [],
    ...(focusedSpaceId === undefined ? {} : { focusedSpaceId }),
  };
}

function connected(sessionId: string, nextSnapshot: HerdrSessionSnapshot): ActiveSessionProjectionState {
  return { kind: "connected", sessionId, snapshot: nextSnapshot };
}

function stale(
  sessionId: string,
  nextSnapshot: HerdrSessionSnapshot,
  reason: "reconnecting" | "incompatible" = "reconnecting",
): ActiveSessionProjectionState {
  return { kind: "stale", sessionId, reason, snapshot: nextSnapshot };
}

function sessionSource(initial: ActiveSessionProjectionState): {
  source: ActiveSessionProjectionSource;
  setState(next: ActiveSessionProjectionState): void;
} {
  let state = initial;
  const listeners = new Set<(next: ActiveSessionProjectionState) => void>();
  return {
    source: {
      getActiveSessionProjection: () => state,
      onDidChangeActiveSessionProjection: (listener) => {
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

function paneEditorSource(initial: PaneEditorPresence): {
  source: PaneEditorPresenceSource;
  setPresence(next: PaneEditorPresence): void;
} {
  let presence = initial;
  const listeners = new Set<(next: PaneEditorPresence) => void>();
  return {
    source: {
      getPaneEditorPresence: () => presence,
      onDidChangePaneEditorPresence: (listener) => {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
    },
    setPresence: (next) => {
      presence = next;
      listeners.forEach((listener) => listener(next));
    },
  };
}

const noPaneEditors: PaneEditorPresenceSource = {
  getPaneEditorPresence: () => ({ visible: [] }),
  onDidChangePaneEditorPresence: () => ({ dispose: () => undefined }),
};

describe("NavigationContextModel", () => {
  it("follows focused Pane Editors only within the active Session and keeps the Selected Space for file editors", () => {
    const initialSnapshot = snapshot(["space-a", "space-b"], "space-a");
    const harness = sessionSource(connected("session-1", initialSnapshot));
    const editors = paneEditorSource({ visible: [] });
    const model = new NavigationContextModel(harness.source, editors.source);
    const changes: NavigationContextState[] = [];
    model.onDidChange((state) => changes.push(state));
    const paneA = { sessionId: "session-1", paneId: "pane-space-a" };
    const paneB = { sessionId: "session-1", paneId: "pane-space-b" };
    const otherSessionPaneB = { sessionId: "session-2", paneId: "pane-space-b" };
    const visible = [paneA, paneB, otherSessionPaneB];

    editors.setPresence({ visible, focused: paneB });
    const selectedSpaceB: NavigationContextState = {
      kind: "connected",
      sessionId: "session-1",
      snapshot: initialSnapshot,
      selectedSpaceId: "space-b",
    };
    expect(model.getState()).toEqual(selectedSpaceB);
    expect(changes.at(-1)).toEqual(selectedSpaceB);

    editors.setPresence({ visible, focused: paneA });
    const selectedSpaceA: NavigationContextState = {
      kind: "connected",
      sessionId: "session-1",
      snapshot: initialSnapshot,
      selectedSpaceId: "space-a",
    };
    expect(model.getState()).toEqual(selectedSpaceA);
    expect(changes.at(-1)).toEqual(selectedSpaceA);

    editors.setPresence({ visible, focused: otherSessionPaneB });
    expect(model.getState()).toEqual(selectedSpaceA);

    editors.setPresence({ visible });
    expect(model.getState()).toEqual(selectedSpaceA);
    model.dispose();
  });

  it("preserves a user-selected Space while the same Pane Editor stays focused through presence and snapshot changes", () => {
    const initialSnapshot = snapshot(["space-a", "space-b"], "space-b");
    const harness = sessionSource(connected("session-1", initialSnapshot));
    const paneA = { sessionId: "session-1", paneId: "pane-space-a" };
    const paneB = { sessionId: "session-1", paneId: "pane-space-b" };
    const editors = paneEditorSource({ visible: [paneB], focused: paneB });
    const model = new NavigationContextModel(harness.source, editors.source);
    expect(model.getState()).toMatchObject({ selectedSpaceId: "space-b" });

    model.selectSpace("space-a");
    expect(model.getState()).toMatchObject({ selectedSpaceId: "space-a" });

    editors.setPresence({ visible: [paneB, paneA], focused: { ...paneB } });
    expect(model.getState()).toEqual({
      kind: "connected",
      sessionId: "session-1",
      snapshot: initialSnapshot,
      selectedSpaceId: "space-a",
    });

    const freshSnapshot = snapshot(["space-a", "space-b"], "space-b");
    harness.setState(connected("session-1", freshSnapshot));
    expect(model.getState()).toEqual({
      kind: "connected",
      sessionId: "session-1",
      snapshot: freshSnapshot,
      selectedSpaceId: "space-a",
    });
    model.dispose();
  });

  it("publishes only the active Session's Visible Pane Editor IDs and follows Session switches", () => {
    const harness = sessionSource(connected("session-1", snapshot(["space-a", "space-b"], "space-a")));
    const editors = paneEditorSource({ visible: [] });
    const model = new NavigationContextModel(harness.source, editors.source);
    const visibleChanges: ReadonlySet<string>[] = [];
    model.onDidChangeVisiblePaneIds((paneIds) => visibleChanges.push(paneIds));
    expect(model.getVisiblePaneIds()).toEqual(new Set());

    editors.setPresence({
      visible: [
        { sessionId: "session-2", paneId: "pane-space-c" },
        { sessionId: "session-1", paneId: "pane-space-a" },
        { sessionId: "session-1", paneId: "pane-space-b" },
      ],
    });
    expect(model.getVisiblePaneIds()).toEqual(new Set(["pane-space-a", "pane-space-b"]));
    expect(visibleChanges.at(-1)).toEqual(new Set(["pane-space-a", "pane-space-b"]));

    harness.setState(connected("session-2", snapshot(["space-c"], "space-c")));
    expect(model.getState()).toMatchObject({ sessionId: "session-2", selectedSpaceId: "space-c" });
    expect(model.getVisiblePaneIds()).toEqual(new Set(["pane-space-c"]));
    expect(visibleChanges.at(-1)).toEqual(new Set(["pane-space-c"]));
    model.dispose();
  });

  it("publishes the active Session's Focused Pane Editor after the Selected Space it moves to", () => {
    const harness = sessionSource(connected("session-1", snapshot(["space-a", "space-b"], "space-a")));
    const editors = paneEditorSource({ visible: [] });
    const model = new NavigationContextModel(harness.source, editors.source);
    const events: string[] = [];
    model.onDidChange((state) => events.push(`space ${state.kind === "unavailable" ? "" : state.selectedSpaceId}`));
    model.onDidChangeFocusedEditorPaneId((paneId) => events.push(`focused ${paneId}`));
    const paneB = { sessionId: "session-1", paneId: "pane-space-b" };
    const otherSessionPane = { sessionId: "session-2", paneId: "pane-space-c" };

    editors.setPresence({ visible: [paneB], focused: paneB });
    expect(model.getFocusedEditorPaneId()).toBe("pane-space-b");
    expect(events).toEqual(["space space-b", "focused pane-space-b"]);

    editors.setPresence({ visible: [paneB, otherSessionPane], focused: otherSessionPane });
    expect(model.getFocusedEditorPaneId()).toBeUndefined();
    expect(events.at(-1)).toBe("focused undefined");

    harness.setState(connected("session-2", snapshot(["space-c"], "space-c")));
    expect(model.getFocusedEditorPaneId()).toBe("pane-space-c");
    expect(events.at(-1)).toBe("focused pane-space-c");
    model.dispose();
  });

  it("treats a focused Pane its snapshot does not list yet as unfocused until a snapshot lists it", () => {
    const harness = sessionSource(connected("session-1", snapshot(["space-a"], "space-a")));
    const paneA = { sessionId: "session-1", paneId: "pane-space-a" };
    const editors = paneEditorSource({ visible: [paneA], focused: paneA });
    const model = new NavigationContextModel(harness.source, editors.source);
    const focusedChanges: (string | undefined)[] = [];
    model.onDidChangeFocusedEditorPaneId((paneId) => focusedChanges.push(paneId));

    // pane.moved rekeys the Pane Editor before the snapshot that lists the Pane under its new ID arrives.
    const moved = { sessionId: "session-1", paneId: "pane-space-b" };
    editors.setPresence({ visible: [moved], focused: moved });
    expect(model.getFocusedEditorPaneId()).toBeUndefined();
    expect(model.getState()).toMatchObject({ selectedSpaceId: "space-a" });

    harness.setState(connected("session-1", snapshot(["space-a", "space-b"], "space-a")));
    expect(model.getFocusedEditorPaneId()).toBe("pane-space-b");
    expect(model.getState()).toMatchObject({ selectedSpaceId: "space-b" });
    expect(focusedChanges).toEqual([undefined, "pane-space-b"]);
    model.dispose();
  });

  it("resolves and reconciles local Space selection across Session lifecycles", () => {
    const harness = sessionSource({ kind: "unavailable" });
    const model = new NavigationContextModel(harness.source, noPaneEditors);
    const changes: NavigationContextState[] = [];
    model.onDidChange((state) => changes.push(state));

    harness.setState(connected("session-1", snapshot(["space-a", "space-b"], "space-b")));
    expect(model.getState()).toMatchObject({ kind: "connected", sessionId: "session-1", selectedSpaceId: "space-b" });

    model.selectSpace("space-a");
    expect(model.getState()).toMatchObject({ selectedSpaceId: "space-a" });
    const changeCountAfterSelection = changes.length;
    model.selectSpace("missing-space");
    expect(model.getState()).toMatchObject({ selectedSpaceId: "space-a" });
    expect(changes).toHaveLength(changeCountAfterSelection);

    harness.setState(connected("session-1", snapshot(["space-a", "space-b"], "space-b")));
    expect(model.getState()).toMatchObject({ selectedSpaceId: "space-a" });

    harness.setState(connected("session-1", snapshot(["space-b", "space-c"], "space-c")));
    expect(model.getState()).toMatchObject({ selectedSpaceId: "space-c" });

    harness.setState(connected("session-2", snapshot(["space-a", "space-b"], "space-b")));
    expect(model.getState()).toMatchObject({ sessionId: "session-2", selectedSpaceId: "space-b" });

    harness.setState(connected("session-2", snapshot(["space-x", "space-y"])));
    expect(model.getState()).toMatchObject({ sessionId: "session-2", selectedSpaceId: "space-x" });

    harness.setState(connected("session-2", snapshot([])));
    const empty = model.getState();
    expect(empty.kind).toBe("connected");
    expect("selectedSpaceId" in empty).toBe(false);
    model.dispose();
  });

  it("retains a valid local choice through stale and fresh projections", () => {
    const initialSnapshot = snapshot(["space-a", "space-b"], "space-b");
    const harness = sessionSource(connected("session-1", initialSnapshot));
    const model = new NavigationContextModel(harness.source, noPaneEditors);
    model.selectSpace("space-a");

    harness.setState(stale("session-1", snapshot(["space-a", "space-b"], "space-b")));
    expect(model.getState()).toMatchObject({ kind: "stale", selectedSpaceId: "space-a" });

    harness.setState(connected("session-1", snapshot(["space-a", "space-b"], "space-b")));
    expect(model.getState()).toMatchObject({ kind: "connected", selectedSpaceId: "space-a" });

    harness.setState(stale("session-1", snapshot(["space-b"], "space-b"), "incompatible"));
    expect(model.getState()).toMatchObject({ kind: "stale", selectedSpaceId: "space-b", reason: "incompatible" });

    model.dispose();
  });
});
