export type { HerdrConfiguration, HerdrConfigurationActions, HerdrConfigurationSource } from "./configuration.js";
export type { HerdrSessionId, HerdrSessionDescriptor, HerdrSessionMetadata, HerdrResolvedSession } from "./session.js";
export type {
  HerdrAgentStatus,
  HerdrAgentSessionReference,
  HerdrSpaceWorktree,
  HerdrSpace,
  HerdrTab,
  HerdrPaneScroll,
  HerdrPane,
  HerdrAgent,
  HerdrLayoutRectangle,
  HerdrLayoutPane,
  HerdrLayoutSplit,
  HerdrTabLayout,
  HerdrSessionSnapshot,
} from "./snapshot.js";
export type { HerdrSessionListResult, HerdrSessionDirectory } from "./directory.js";
export {
  HerdrConnectionFailureError,
  type HerdrConnectionFailure,
  type HerdrSessionProjectionConsumer,
  type HerdrSessionConnection,
  type HerdrSessionConnectionFactory,
} from "./connection.js";
