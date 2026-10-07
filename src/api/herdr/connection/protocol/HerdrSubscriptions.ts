import { invalidResponse } from "./HerdrProtocol";
import type { HerdrProtocolRecord } from "./HerdrProtocol";

const baseSubscriptions = [
  "workspace.created",
  "workspace.updated",
  "workspace.metadata_updated",
  "workspace.renamed",
  "workspace.moved",
  "workspace.reordered",
  "workspace.closed",
  "workspace.focused",
  "worktree.created",
  "worktree.opened",
  "worktree.removed",
  "tab.created",
  "tab.closed",
  "tab.focused",
  "tab.renamed",
  "tab.moved",
  "pane.created",
  "pane.closed",
  "pane.updated",
  "pane.focused",
  "pane.moved",
  "pane.exited",
  "pane.agent_detected",
  "layout.updated",
] as const;

const relevantEvents = new Set<string>([
  ...baseSubscriptions,
  ...baseSubscriptions.map((subscription) => subscription.replaceAll(".", "_")),
  "pane.agent_status_changed",
  "pane_agent_status_changed",
]);

export type HerdrSubscription = Readonly<{
  type: string;
  pane_id?: string;
}>;

export function subscriptionsForPanes(paneIds: readonly string[]): readonly HerdrSubscription[] {
  const subscriptions: HerdrSubscription[] = baseSubscriptions.map((type) => ({ type }));
  for (const paneId of paneIds) subscriptions.push({ type: "pane.agent_status_changed", pane_id: paneId });
  return subscriptions;
}

export function validateEventMessage(message: HerdrProtocolRecord): boolean {
  if (typeof message.event !== "string" || !isRecord(message.data)) {
    throw invalidResponse("Herdr returned an invalid event envelope.");
  }
  return relevantEvents.has(message.event);
}

function isRecord(value: unknown): value is HerdrProtocolRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
