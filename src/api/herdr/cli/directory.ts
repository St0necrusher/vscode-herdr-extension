import type { HerdrSessionDescriptor, HerdrResolvedSession, HerdrSessionId } from "../shared";

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
  list(executable: string): Promise<HerdrSessionListResult>;
  resolve(executable: string, sessionId: HerdrSessionId): Promise<HerdrResolvedSession>;
  start(executable: string, sessionId: HerdrSessionId): Promise<void>;
}
