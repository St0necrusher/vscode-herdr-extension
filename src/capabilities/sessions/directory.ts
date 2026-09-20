import type { HerdrConfiguration } from "./configuration.js";
import type { HerdrSessionDescriptor, HerdrResolvedSession, HerdrSessionId } from "./session.js";

export type HerdrSessionListResult =
  | Readonly<{
      kind: "success";
      sessions: readonly HerdrSessionDescriptor[];
    }>
  | Readonly<{ kind: "missing-executable" }>
  | Readonly<{
      kind: "failure";
      diagnostic: string;
    }>;

export interface HerdrSessionDirectory {
  list(configuration: HerdrConfiguration): Promise<HerdrSessionListResult>;
  resolve(configuration: HerdrConfiguration, sessionId: HerdrSessionId): Promise<HerdrResolvedSession>;
  start(configuration: HerdrConfiguration, sessionId: HerdrSessionId): Promise<void>;
}
