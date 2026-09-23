import { describe, expect, it } from "vitest";
import type {
  ActiveSessionProjectionSource,
  ActiveSessionProjectionState,
  HerdrSessionSnapshot,
} from "@capabilities/sessions";
import { NavigationContextModel } from "./NavigationContextModel";
import type { NavigationContextState } from "./capabilities";

function snapshot(spaceIds: readonly string[], focusedSpaceId?: string): HerdrSessionSnapshot {
  const spaces = spaceIds.map((id, index) => ({
    id,
    number: index + 1,
    label: `Space ${id}`,
    focused: id === focusedSpaceId,
    paneCount: 0,
    tabCount: 0,
    activeHerdrTabId: "",
    agentStatus: "idle" as const,
    tokens: {},
  }));
  return {
    version: "1",
    protocol: 1,
    spaces,
    herdrTabs: [],
    panes: [],
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

describe("NavigationContextModel", () => {
  it("resolves and reconciles local Space selection across Session lifecycles", () => {
    const harness = sessionSource({ kind: "unavailable" });
    const model = new NavigationContextModel(harness.source);
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
    const model = new NavigationContextModel(harness.source);
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
