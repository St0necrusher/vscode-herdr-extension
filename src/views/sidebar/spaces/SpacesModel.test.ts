import { describe, expect, it } from "vitest";
import type { HerdrSessionSnapshot } from "../../../api/herdr/shared/types";
import type { NavigationContextSource, NavigationContextState } from "@modules/workspace-context";
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

function worktree(
  checkoutPath: string,
  isLinkedWorktree: boolean,
  repositoryKey: string,
): NonNullable<NavigationSpace["worktree"]> {
  return {
    checkoutPath,
    isLinkedWorktree,
    repositoryKey,
    repositoryName: "Project",
    repositoryRoot: "/repositories/project",
  };
}

function connectedEntries(spaces: readonly NavigationSpace[], selectedSpaceId: string) {
  const model = new SpacesModel(contextSource(contextState("connected", spaces, selectedSpaceId)).source);
  const state = model.getState();
  model.dispose();
  if (state.kind !== "connected") throw new Error("expected connected Spaces state");
  return state.spaces;
}

describe("SpacesModel", () => {
  it("forms a Worktree Group from a primary Space and linked-worktree Spaces, primary first", () => {
    const linked = space("linked", {
      worktree: worktree("/worktrees/project-feature", true, "project-repository"),
    });
    const primary = space("primary", {
      worktree: worktree("/repositories/project", false, "project-repository"),
    });
    const entries = connectedEntries([linked, primary], primary.id);
    const primaryEntry = entries.find((entry) => entry.space.id === primary.id);
    const linkedEntry = entries.find((entry) => entry.space.id === linked.id);

    expect(primaryEntry?.worktreeGroup).toEqual([primary, linked]);
    expect(linkedEntry?.worktreeGroup).toBeUndefined();
  });

  it("does not form a Worktree Group from a linked-only Space or a Space without a worktree", () => {
    const linked = space("linked-only", {
      worktree: worktree("/worktrees/project-feature", true, "project-repository"),
    });
    const withoutWorktree = space("without-worktree");
    const entries = connectedEntries([linked, withoutWorktree], linked.id);

    expect(entries.map((entry) => entry.worktreeGroup)).toEqual([undefined, undefined]);
  });

  it("does not form a Worktree Group when another same-repository Space is not a linked worktree", () => {
    const primary = space("primary", {
      worktree: worktree("/repositories/project", false, "project-repository"),
    });
    const otherUnlinked = space("other-unlinked", {
      worktree: worktree("/repositories/project-copy", false, "project-repository"),
    });
    const linked = space("linked", {
      worktree: worktree("/worktrees/project-feature", true, "project-repository"),
    });
    const entries = connectedEntries([primary, otherUnlinked, linked], primary.id);

    expect(entries.map((entry) => entry.worktreeGroup)).toEqual([undefined, undefined, undefined]);
  });

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
