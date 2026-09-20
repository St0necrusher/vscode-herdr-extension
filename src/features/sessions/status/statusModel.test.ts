import { describe, expect, it } from "vitest";
import { statusModel } from "./statusModel";
import type { SessionsState } from "../capabilities";
const base = { executable: "herdr", session: "default" };
describe("statusModel", () => {
  it("derives recovery actions from aggregate catalog and active state", () => {
    const state: SessionsState = {
      configuration: base,
      catalog: { kind: "ready", sessions: [{ id: "default", isDefault: true, availability: "stopped" }] },
      active: { kind: "selected-stopped", session: { id: "default", isDefault: true, availability: "stopped" } },
    };
    const model = statusModel(state);
    expect(model.kind).toBe("stopped");
    expect(model.availableActions).toContain("start");
    expect(model.availableActions).toContain("retry");
  });
  it("projects explicit Start failure as recoverable error without offering implicit Start", () => {
    const state: SessionsState = {
      configuration: base,
      catalog: { kind: "ready", sessions: [{ id: "default", isDefault: true, availability: "stopped" }] },
      active: {
        kind: "start-failed",
        session: { id: "default", isDefault: true, availability: "stopped" },
        diagnostic: "permission denied",
      },
    };
    expect(statusModel(state)).toMatchObject({ kind: "error", diagnostic: "permission denied" });
    expect(statusModel(state).availableActions).toEqual(["retry", "open-settings", "show-diagnostics"]);
    expect(statusModel(state).availableActions).not.toContain("start");
  });

  it("retains diagnostics and connection metadata", () => {
    const state: SessionsState = {
      configuration: base,
      catalog: { kind: "ready", sessions: [] },
      active: {
        kind: "disconnected",
        session: { id: "default", isDefault: true, availability: "running" },
        metadata: { version: "1", protocol: 2 },
        endpoint: "/tmp/herdr.sock",
        failure: { kind: "transport", diagnostic: "closed" },
      },
    };
    expect(statusModel(state)).toMatchObject({
      kind: "disconnected",
      version: "1",
      protocol: 2,
      endpoint: "/tmp/herdr.sock",
      diagnostic: "closed",
    });
  });
});
