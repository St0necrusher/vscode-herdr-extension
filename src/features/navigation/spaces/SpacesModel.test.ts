import { describe, expect, it } from "vitest";
import type { HerdrSessionSnapshot } from "@capabilities/sessions";
import type { NavigationContextSource, NavigationContextState } from "../capabilities";
import { SpacesModel } from "./SpacesModel";
import type { SpacesState } from "./SpacesModel";

function space(id: string, overrides: Partial<NavigationSpace> = {}): NavigationSpace {
  return {
    id,
    number: 1,
    label: `Server label ${id}`,
    focused: false,
    paneCount: 0,
    tabCount: 0,
    activeHerdrTabId: "",
    agentStatus: "idle",
    tokens: {},
    ...overrides,
  };
}

type NavigationSpace = HerdrSessionSnapshot["spaces"][number];

function snapshot(spaces: readonly NavigationSpace[]): HerdrSessionSnapshot {
  return {
    version: "1",
    protocol: 1,
    spaces,
    herdrTabs: [],
    panes: [],
    layouts: [],
    agents: [],
  };
}

function contextState(
  kind: "connected" | "stale",
  spaces: readonly NavigationSpace[],
  selectedSpaceId: string,
): NavigationContextState {
  const context = {
    sessionId: "session-1",
    snapshot: snapshot(spaces),
    selectedSpaceId,
  } as const;
  return kind === "connected" ? { kind, ...context } : { kind, reason: "reconnecting", ...context };
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

describe("SpacesModel", () => {
  it("derives server-ordered Space rows and freshness from the context seam", () => {
    const first = space("space-1", { number: 7, label: "Alpha", paneCount: 3, tabCount: 2, agentStatus: "working" });
    const second = space("space-2", { number: 2, label: "Beta", paneCount: 1, tabCount: 1, agentStatus: "blocked" });
    const third = space("space-3", { number: 4, label: "Gamma", paneCount: 0, tabCount: 0, agentStatus: "done" });
    const harness = contextSource(contextState("connected", [first, second, third], "space-2"));
    const model = new SpacesModel(harness.source);
    const changes: SpacesState[] = [];
    model.onDidChange((state) => changes.push(state));

    const connected = model.getState();
    expect(connected.kind).toBe("connected");
    if (connected.kind !== "connected") throw new Error("expected connected Spaces state");
    expect(connected.spaces.map((entry) => entry.space.id)).toEqual(["space-1", "space-2", "space-3"]);
    expect(connected.spaces.map((entry) => entry.selected)).toEqual([false, true, false]);
    expect(connected.spaces[0]?.space).toBe(first);
    expect(
      connected.spaces.map((entry) => [entry.space.label, entry.space.paneCount, entry.space.agentStatus]),
    ).toEqual([
      ["Alpha", 3, "working"],
      ["Beta", 1, "blocked"],
      ["Gamma", 0, "done"],
    ]);

    harness.setState(contextState("stale", [first, second, third], "space-2"));
    const stale = model.getState();
    expect(stale).toMatchObject({ kind: "stale", sessionId: "session-1", reason: "reconnecting" });
    if (stale.kind !== "stale") throw new Error("expected stale Spaces state");
    expect(stale.spaces.map((entry) => entry.space.id)).toEqual(["space-1", "space-2", "space-3"]);
    expect(stale.spaces.find((entry) => entry.selected)?.space.id).toBe("space-2");

    harness.setState({ kind: "unavailable", sessionId: "session-1" });
    expect(model.getState()).toEqual({ kind: "unavailable", sessionId: "session-1" });
    harness.setState({ kind: "unavailable" });
    expect(model.getState()).toEqual({ kind: "unavailable" });
    expect(changes.map((state) => state.kind)).toEqual(["stale", "unavailable", "unavailable"]);

    model.dispose();
  });
});
