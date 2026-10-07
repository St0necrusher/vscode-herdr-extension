import type { HerdrPane, PaneClientRequest } from "@api/herdr";

export type PaneEditorVisibility = "hidden" | "blurred" | "focused";
export type AttachIntent = "wanted" | "displaced" | "failed";

type NoClient = Readonly<{ kind: "none" }>;
type ObserveClient = Readonly<{ kind: "observe"; request: PaneClientRequest }>;
type AttachClient = Readonly<{ kind: "attach"; request: PaneClientRequest }>;

export type DesiredClient = NoClient | ObserveClient | AttachClient;

export function desiredClient(
  facts: Readonly<{
    target: HerdrPane | undefined;
    sessionId: string;
    visibility: PaneEditorVisibility;
    dimensions: Readonly<{ columns: number; rows: number }> | undefined;
    intent: AttachIntent;
  }>,
): DesiredClient {
  const target = facts.target;
  if (target === undefined) return { kind: "none" };
  if (facts.visibility === "hidden") return { kind: "none" };

  const dimensions = facts.dimensions;
  if (dimensions === undefined) return { kind: "none" };

  const request: PaneClientRequest = {
    sessionId: facts.sessionId,
    terminalId: target.terminalId,
    columns: dimensions.columns,
    rows: dimensions.rows,
  };
  const shouldAttach = facts.visibility === "focused" && facts.intent === "wanted";
  if (shouldAttach) return { kind: "attach", request };
  return { kind: "observe", request };
}
