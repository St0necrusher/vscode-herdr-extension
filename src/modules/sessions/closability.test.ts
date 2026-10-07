import { describe, expect, it } from "vitest";
import type { HerdrPane, HerdrTab } from "@api/herdr";
import { isPaneClosable, isTabClosable } from "./closability";

const tab: HerdrTab = {
  id: "tab-1",
  spaceId: "space-1",
  number: 1,
  label: "Tab",
  focused: false,
  paneCount: 1,
  agentStatus: "idle",
};
const pane: HerdrPane = {
  id: "pane-1",
  terminalId: "terminal-1",
  spaceId: "space-1",
  herdrTabId: tab.id,
  focused: false,
  agentStatus: "idle",
  revision: 1,
  stateLabels: {},
  tokens: {},
};

describe("closability", () => {
  it("allows closing a Pane only when the Selected Space contains another Pane", () => {
    expect(isPaneClosable([])).toBe(false);
    expect(isPaneClosable([pane])).toBe(false);
    expect(isPaneClosable([pane, { ...pane, id: "pane-2" }])).toBe(true);
  });

  it("allows closing a Tab only when the Selected Space contains another Tab", () => {
    expect(isTabClosable([])).toBe(false);
    expect(isTabClosable([tab])).toBe(false);
    expect(isTabClosable([tab, { ...tab, id: "tab-2" }])).toBe(true);
  });
});
