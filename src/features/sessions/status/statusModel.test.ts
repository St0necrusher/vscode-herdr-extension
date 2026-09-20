import { describe, expect, it } from "vitest";
import { statusModel } from "./statusModel.js";
import type { SessionsState } from "../capabilities/index.js";
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
