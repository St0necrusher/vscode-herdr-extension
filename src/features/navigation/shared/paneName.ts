import type { HerdrPane } from "@capabilities/sessions";

export function paneName(pane: HerdrPane): string {
  return nonEmpty(pane.label) ?? nonEmpty(pane.terminalTitle) ?? `Pane ${pane.id}`;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}
