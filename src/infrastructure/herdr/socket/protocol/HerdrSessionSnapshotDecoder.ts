import type {
  HerdrAgent,
  HerdrAgentSessionReference,
  HerdrAgentStatus,
  HerdrLayoutPane,
  HerdrLayoutRectangle,
  HerdrLayoutSplit,
  HerdrPane,
  HerdrPaneScroll,
  HerdrSessionMetadata,
  HerdrSessionSnapshot,
  HerdrSpace,
  HerdrSpaceWorktree,
  HerdrTab,
  HerdrTabLayout,
} from "#capabilities/sessions";
import { incompatible, invalidResponse, requireResultType, type HerdrProtocolRecord } from "./HerdrProtocol.js";

export function parseSnapshotResult(result: HerdrProtocolRecord, metadata: HerdrSessionMetadata): HerdrSessionSnapshot {
  requireResultType(result, "session_snapshot");
  if (!isRecord(result.snapshot)) throw invalidResponse("Herdr returned an invalid Session snapshot.");
  const raw = result.snapshot;
  const version = requiredString(raw, "version", "snapshot");
  const protocol = requiredNumber(raw, "protocol", "snapshot");
  if (version !== metadata.version || protocol !== metadata.protocol) {
    throw incompatible("Herdr snapshot protocol metadata does not match ping.", {
      version,
      protocol,
      ...(metadata.endpointProtocolGeneration === undefined
        ? {}
        : { endpointProtocolGeneration: metadata.endpointProtocolGeneration }),
    });
  }

  const spaces = requiredArray(raw, "workspaces", "snapshot").map((value) => parseSpace(value));
  const herdrTabs = requiredArray(raw, "tabs", "snapshot").map((value) => parseTab(value));
  const panes = requiredArray(raw, "panes", "snapshot").map((value) => parsePane(value));
  const layouts = requiredArray(raw, "layouts", "snapshot").map((value) => parseLayout(value));
  const agents = requiredArray(raw, "agents", "snapshot").map((value) => parseAgent(value));

  assertUnique(
    spaces.map((space) => space.id),
    "Space",
  );
  assertUnique(
    herdrTabs.map((tab) => tab.id),
    "Herdr Tab",
  );
  assertUnique(
    panes.map((pane) => pane.id),
    "Pane",
  );
  assertUnique(
    agents.map((agent) => `${agent.paneId}:${agent.terminalId}`),
    "Agent",
  );

  const spaceIds = new Set(spaces.map((space) => space.id));
  const tabIds = new Set(herdrTabs.map((tab) => tab.id));
  const paneIds = new Set(panes.map((pane) => pane.id));
  for (const tab of herdrTabs) requireReference(spaceIds, tab.spaceId, "Herdr Tab Space");
  for (const pane of panes) {
    requireReference(spaceIds, pane.spaceId, "Pane Space");
    requireReference(tabIds, pane.herdrTabId, "Pane Herdr Tab");
  }
  for (const agent of agents) {
    requireReference(spaceIds, agent.spaceId, "Agent Space");
    requireReference(tabIds, agent.herdrTabId, "Agent Herdr Tab");
    requireReference(paneIds, agent.paneId, "Agent Pane");
  }
  for (const layout of layouts) {
    requireReference(spaceIds, layout.spaceId, "Layout Space");
    requireReference(tabIds, layout.herdrTabId, "Layout Herdr Tab");
    requireReference(paneIds, layout.focusedPaneId, "Layout focused Pane");
    for (const pane of layout.panes) requireReference(paneIds, pane.paneId, "Layout Pane");
  }

  const focusedSpaceId = nullableString(raw, "focused_workspace_id", "snapshot");
  const focusedHerdrTabId = nullableString(raw, "focused_tab_id", "snapshot");
  const focusedPaneId = nullableString(raw, "focused_pane_id", "snapshot");
  if (focusedSpaceId !== undefined) requireReference(spaceIds, focusedSpaceId, "focused Space");
  if (focusedHerdrTabId !== undefined) requireReference(tabIds, focusedHerdrTabId, "focused Herdr Tab");
  if (focusedPaneId !== undefined) requireReference(paneIds, focusedPaneId, "focused Pane");

  return {
    version,
    protocol,
    spaces,
    herdrTabs,
    panes,
    layouts,
    agents,
    ...(focusedSpaceId === undefined ? {} : { focusedSpaceId }),
    ...(focusedHerdrTabId === undefined ? {} : { focusedHerdrTabId }),
    ...(focusedPaneId === undefined ? {} : { focusedPaneId }),
  };
}

function parseSpace(value: unknown): HerdrSpace {
  const record = object(value, "Space");
  const worktreeValue = record.worktree;
  return {
    id: requiredString(record, "workspace_id", "Space"),
    number: requiredInteger(record, "number", "Space"),
    label: requiredString(record, "label", "Space"),
    focused: requiredBoolean(record, "focused", "Space"),
    paneCount: requiredInteger(record, "pane_count", "Space"),
    tabCount: requiredInteger(record, "tab_count", "Space"),
    activeHerdrTabId: requiredString(record, "active_tab_id", "Space"),
    agentStatus: agentStatus(record.agent_status, "Space"),
    tokens: optionalStringMap(record, "tokens", "Space"),
    ...(worktreeValue === undefined || worktreeValue === null ? {} : { worktree: parseSpaceWorktree(worktreeValue) }),
  };
}

function parseTab(value: unknown): HerdrTab {
  const record = object(value, "Herdr Tab");
  return {
    id: requiredString(record, "tab_id", "Herdr Tab"),
    spaceId: requiredString(record, "workspace_id", "Herdr Tab"),
    number: requiredInteger(record, "number", "Herdr Tab"),
    label: requiredString(record, "label", "Herdr Tab"),
    focused: requiredBoolean(record, "focused", "Herdr Tab"),
    paneCount: requiredInteger(record, "pane_count", "Herdr Tab"),
    agentStatus: agentStatus(record.agent_status, "Herdr Tab"),
  };
}

function parsePane(value: unknown): HerdrPane {
  const record = object(value, "Pane");
  const cwd = optionalString(record, "cwd", "Pane");
  const foregroundCwd = optionalString(record, "foreground_cwd", "Pane");
  const label = optionalString(record, "label", "Pane");
  const title = optionalString(record, "title", "Pane");
  const displayAgent = optionalString(record, "display_agent", "Pane");
  const agent = optionalString(record, "agent", "Pane");
  const terminalTitle = optionalString(record, "terminal_title", "Pane");
  const terminalTitleStripped = optionalString(record, "terminal_title_stripped", "Pane");
  const scroll = record.scroll === undefined || record.scroll === null ? undefined : parseScroll(record.scroll);
  const agentSession =
    record.agent_session === undefined || record.agent_session === null
      ? undefined
      : parseAgentSession(record.agent_session, "Pane");
  return {
    id: requiredString(record, "pane_id", "Pane"),
    terminalId: requiredString(record, "terminal_id", "Pane"),
    spaceId: requiredString(record, "workspace_id", "Pane"),
    herdrTabId: requiredString(record, "tab_id", "Pane"),
    focused: requiredBoolean(record, "focused", "Pane"),
    agentStatus: agentStatus(record.agent_status, "Pane"),
    revision: requiredInteger(record, "revision", "Pane"),
    ...(cwd === undefined ? {} : { cwd }),
    ...(foregroundCwd === undefined ? {} : { foregroundCwd }),
    ...(label === undefined ? {} : { label }),
    ...(title === undefined ? {} : { title }),
    ...(displayAgent === undefined ? {} : { displayAgent }),
    ...(agent === undefined ? {} : { agent }),
    ...(terminalTitle === undefined ? {} : { terminalTitle }),
    ...(terminalTitleStripped === undefined ? {} : { terminalTitleStripped }),
    ...(scroll === undefined ? {} : { scroll }),
    stateLabels: optionalStringMap(record, "state_labels", "Pane"),
    tokens: optionalStringMap(record, "tokens", "Pane"),
    ...(agentSession === undefined ? {} : { agentSession }),
  };
}

function parseAgent(value: unknown): HerdrAgent {
  const record = object(value, "Agent");
  const cwd = optionalString(record, "cwd", "Agent");
  const foregroundCwd = optionalString(record, "foreground_cwd", "Agent");
  const name = optionalString(record, "name", "Agent");
  const title = optionalString(record, "title", "Agent");
  const displayAgent = optionalString(record, "display_agent", "Agent");
  const agent = optionalString(record, "agent", "Agent");
  const terminalTitle = optionalString(record, "terminal_title", "Agent");
  const terminalTitleStripped = optionalString(record, "terminal_title_stripped", "Agent");
  const agentSession =
    record.agent_session === undefined || record.agent_session === null
      ? undefined
      : parseAgentSession(record.agent_session, "Agent");
  return {
    terminalId: requiredString(record, "terminal_id", "Agent"),
    agentStatus: agentStatus(record.agent_status, "Agent"),
    spaceId: requiredString(record, "workspace_id", "Agent"),
    herdrTabId: requiredString(record, "tab_id", "Agent"),
    paneId: requiredString(record, "pane_id", "Agent"),
    focused: requiredBoolean(record, "focused", "Agent"),
    revision: requiredInteger(record, "revision", "Agent"),
    interactiveReady: optionalBoolean(record, "interactive_ready", "Agent"),
    launchPending: optionalBoolean(record, "launch_pending", "Agent"),
    screenDetectionSkipped: optionalBoolean(record, "screen_detection_skipped", "Agent"),
    stateChangeSequence: optionalInteger(record, "state_change_seq", "Agent"),
    ...(cwd === undefined ? {} : { cwd }),
    ...(foregroundCwd === undefined ? {} : { foregroundCwd }),
    ...(name === undefined ? {} : { name }),
    ...(title === undefined ? {} : { title }),
    ...(displayAgent === undefined ? {} : { displayAgent }),
    ...(agent === undefined ? {} : { agent }),
    ...(terminalTitle === undefined ? {} : { terminalTitle }),
    ...(terminalTitleStripped === undefined ? {} : { terminalTitleStripped }),
    stateLabels: optionalStringMap(record, "state_labels", "Agent"),
    tokens: optionalStringMap(record, "tokens", "Agent"),
    ...(agentSession === undefined ? {} : { agentSession }),
  };
}

function parseLayout(value: unknown): HerdrTabLayout {
  const record = object(value, "layout");
  return {
    spaceId: requiredString(record, "workspace_id", "layout"),
    herdrTabId: requiredString(record, "tab_id", "layout"),
    zoomed: requiredBoolean(record, "zoomed", "layout"),
    area: parseRectangle(record.area, "layout area"),
    focusedPaneId: requiredString(record, "focused_pane_id", "layout"),
    panes: requiredArray(record, "panes", "layout").map((pane) => parseLayoutPane(pane)),
    splits: requiredArray(record, "splits", "layout").map((split) => parseLayoutSplit(split)),
  };
}

function parseLayoutPane(value: unknown): HerdrLayoutPane {
  const record = object(value, "layout pane");
  return {
    paneId: requiredString(record, "pane_id", "layout pane"),
    focused: requiredBoolean(record, "focused", "layout pane"),
    rectangle: parseRectangle(record.rect, "layout pane rectangle"),
  };
}

function parseLayoutSplit(value: unknown): HerdrLayoutSplit {
  const record = object(value, "layout split");
  const direction = requiredString(record, "direction", "layout split");
  if (direction !== "right" && direction !== "down")
    throw invalidResponse("Herdr returned an invalid layout split direction.");
  return {
    id: requiredString(record, "id", "layout split"),
    direction,
    ratio: requiredNumber(record, "ratio", "layout split"),
    rectangle: parseRectangle(record.rect, "layout split rectangle"),
  };
}

function parseRectangle(value: unknown, label: string): HerdrLayoutRectangle {
  const record = object(value, label);
  return {
    x: requiredInteger(record, "x", label),
    y: requiredInteger(record, "y", label),
    width: requiredInteger(record, "width", label),
    height: requiredInteger(record, "height", label),
  };
}

function parseSpaceWorktree(value: unknown): HerdrSpaceWorktree {
  const record = object(value, "Space worktree");
  return {
    checkoutPath: requiredString(record, "checkout_path", "Space worktree"),
    isLinkedWorktree: requiredBoolean(record, "is_linked_worktree", "Space worktree"),
    repositoryKey: requiredString(record, "repo_key", "Space worktree"),
    repositoryName: requiredString(record, "repo_name", "Space worktree"),
    repositoryRoot: requiredString(record, "repo_root", "Space worktree"),
  };
}

function parseAgentSession(value: unknown, label: string): HerdrAgentSessionReference {
  const record = object(value, `${label} agent session`);
  const kind = requiredString(record, "kind", `${label} agent session`);
  if (kind !== "id" && kind !== "path") throw invalidResponse(`Herdr returned an invalid ${label} agent session kind.`);
  return {
    source: requiredString(record, "source", `${label} agent session`),
    agent: requiredString(record, "agent", `${label} agent session`),
    kind,
    value: requiredString(record, "value", `${label} agent session`),
  };
}

function parseScroll(value: unknown): HerdrPaneScroll {
  const record = object(value, "Pane scroll");
  return {
    maxOffsetFromBottom: requiredInteger(record, "max_offset_from_bottom", "Pane scroll"),
    offsetFromBottom: requiredInteger(record, "offset_from_bottom", "Pane scroll"),
    viewportRows: requiredInteger(record, "viewport_rows", "Pane scroll"),
  };
}

function agentStatus(value: unknown, label: string): HerdrAgentStatus {
  if (value === "idle" || value === "working" || value === "blocked" || value === "done" || value === "unknown") {
    return value;
  }
  throw invalidResponse(`Herdr returned an invalid ${label} Agent status.`);
}

function optionalStringMap(record: HerdrProtocolRecord, key: string, label: string): Readonly<Record<string, string>> {
  const value = record[key];
  if (value === undefined) return {};
  if (!isRecord(value)) throw invalidResponse(`Herdr returned an invalid ${label} ${key}.`);
  const result: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== "string") throw invalidResponse(`Herdr returned an invalid ${label} ${key} value.`);
    result[entryKey] = entryValue;
  }
  return result;
}

function optionalString(record: HerdrProtocolRecord, key: string, label: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw invalidResponse(`Herdr returned an invalid ${label} ${key}.`);
  return value;
}

function nullableString(record: HerdrProtocolRecord, key: string, label: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw invalidResponse(`Herdr returned an invalid ${label} ${key}.`);
  return value;
}

function optionalBoolean(record: HerdrProtocolRecord, key: string, label: string): boolean {
  const value = record[key];
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw invalidResponse(`Herdr returned an invalid ${label} ${key}.`);
  return value;
}

function requiredBoolean(record: HerdrProtocolRecord, key: string, label: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw invalidResponse(`Herdr returned an invalid ${label} ${key}.`);
  return value;
}

function optionalInteger(record: HerdrProtocolRecord, key: string, label: string): number {
  const value = record[key];
  if (value === undefined) return 0;
  return integer(value, `${label} ${key}`);
}

function requiredInteger(record: HerdrProtocolRecord, key: string, label: string): number {
  return integer(record[key], `${label} ${key}`);
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalidResponse(`Herdr returned an invalid ${label}.`);
  }
  return value;
}

function requiredNumber(record: HerdrProtocolRecord, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value))
    throw invalidResponse(`Herdr returned an invalid ${label} ${key}.`);
  return value;
}

function requiredString(record: HerdrProtocolRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0)
    throw invalidResponse(`Herdr returned an invalid ${label} ${key}.`);
  return value;
}

function requiredArray(record: HerdrProtocolRecord, key: string, label: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw invalidResponse(`Herdr returned an invalid ${label} ${key} collection.`);
  return value;
}

function object(value: unknown, label: string): HerdrProtocolRecord {
  if (!isRecord(value)) throw invalidResponse(`Herdr returned an invalid ${label}.`);
  return value;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw invalidResponse(`Herdr returned duplicate ${label} identifiers.`);
}

function requireReference(values: ReadonlySet<string>, value: string, label: string): void {
  if (!values.has(value)) throw invalidResponse(`Herdr returned an unknown ${label} reference "${value}".`);
}

function isRecord(value: unknown): value is HerdrProtocolRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
