import type { HerdrPane, HerdrTab } from "@api/herdr";

export function isPaneClosable(panes: readonly HerdrPane[]): boolean {
  return panes.length > 1;
}

export function isTabClosable(tabs: readonly HerdrTab[]): boolean {
  return tabs.length > 1;
}
