export type HerdrAgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export type HerdrAgentSessionReference = Readonly<{
  source: string;
  agent: string;
  kind: "id" | "path";
  value: string;
}>;

export type HerdrSpaceWorktree = Readonly<{
  checkoutPath: string;
  isLinkedWorktree: boolean;
  repositoryKey: string;
  repositoryName: string;
  repositoryRoot: string;
}>;

export type HerdrSpace = Readonly<{
  id: string;
  number: number;
  label: string;
  focused: boolean;
  paneCount: number;
  tabCount: number;
  activeHerdrTabId: string;
  agentStatus: HerdrAgentStatus;
  tokens: Readonly<Record<string, string>>;
  worktree?: HerdrSpaceWorktree;
}>;

export type HerdrTab = Readonly<{
  id: string;
  spaceId: string;
  number: number;
  label: string;
  focused: boolean;
  paneCount: number;
  agentStatus: HerdrAgentStatus;
}>;

export type HerdrPaneScroll = Readonly<{
  maxOffsetFromBottom: number;
  offsetFromBottom: number;
  viewportRows: number;
}>;

export type HerdrPane = Readonly<{
  id: string;
  terminalId: string;
  spaceId: string;
  herdrTabId: string;
  focused: boolean;
  agentStatus: HerdrAgentStatus;
  revision: number;
  cwd?: string;
  foregroundCwd?: string;
  label?: string;
  title?: string;
  displayAgent?: string;
  agent?: string;
  terminalTitle?: string;
  terminalTitleStripped?: string;
  scroll?: HerdrPaneScroll;
  stateLabels: Readonly<Record<string, string>>;
  tokens: Readonly<Record<string, string>>;
  agentSession?: HerdrAgentSessionReference;
}>;

export type HerdrAgent = Readonly<{
  terminalId: string;
  agentStatus: HerdrAgentStatus;
  spaceId: string;
  herdrTabId: string;
  paneId: string;
  focused: boolean;
  revision: number;
  interactiveReady: boolean;
  launchPending: boolean;
  screenDetectionSkipped: boolean;
  stateChangeSequence: number;
  cwd?: string;
  foregroundCwd?: string;
  name?: string;
  title?: string;
  displayAgent?: string;
  agent?: string;
  terminalTitle?: string;
  terminalTitleStripped?: string;
  stateLabels: Readonly<Record<string, string>>;
  tokens: Readonly<Record<string, string>>;
  agentSession?: HerdrAgentSessionReference;
}>;

export type HerdrLayoutRectangle = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type HerdrLayoutPane = Readonly<{
  paneId: string;
  focused: boolean;
  rectangle: HerdrLayoutRectangle;
}>;

export type HerdrLayoutSplit = Readonly<{
  id: string;
  direction: "right" | "down";
  ratio: number;
  rectangle: HerdrLayoutRectangle;
}>;

export type HerdrTabLayout = Readonly<{
  spaceId: string;
  herdrTabId: string;
  zoomed: boolean;
  area: HerdrLayoutRectangle;
  focusedPaneId: string;
  panes: readonly HerdrLayoutPane[];
  splits: readonly HerdrLayoutSplit[];
}>;

export type HerdrSessionSnapshot = Readonly<{
  version: string;
  protocol: number;
  spaces: readonly HerdrSpace[];
  herdrTabs: readonly HerdrTab[];
  panes: readonly HerdrPane[];
  layouts: readonly HerdrTabLayout[];
  agents: readonly HerdrAgent[];
  focusedSpaceId?: string;
  focusedHerdrTabId?: string;
  focusedPaneId?: string;
}>;
