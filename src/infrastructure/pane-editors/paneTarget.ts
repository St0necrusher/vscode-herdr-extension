import type { ActiveSessionProjectionState } from "@capabilities/sessions";
import type { HerdrPane } from "@api/herdr";
import type { SelectedPaneEditor } from "./PaneEditorSelectionModel";

type LivePaneTarget = Readonly<{ kind: "live"; sessionId: string; pane: HerdrPane }>;
type SuspendedPaneTarget = Readonly<{ kind: "suspended"; placeholder: string }>;
export type PaneTarget = LivePaneTarget | SuspendedPaneTarget;

export function paneTarget(
  projection: ActiveSessionProjectionState,
  identity: Readonly<{ sessionId: string; paneId: string }>,
  movedPane: HerdrPane | undefined,
): PaneTarget {
  if (projection.kind === "connected") {
    const projectionMatchesIdentity = projection.sessionId === identity.sessionId;
    if (projectionMatchesIdentity) {
      const pane = projection.snapshot.panes.find((candidate) => candidate.id === identity.paneId);
      if (pane !== undefined) return { kind: "live", sessionId: identity.sessionId, pane };
      if (movedPane?.id === identity.paneId) return { kind: "live", sessionId: identity.sessionId, pane: movedPane };
      return {
        kind: "suspended",
        placeholder: [
          "Herdr Pane is unavailable",
          "",
          `Session “${identity.sessionId}”, Pane “${identity.paneId}” is unavailable.`,
          "You can close this editor.",
        ].join("\r\n"),
      };
    }
  }

  if (projection.kind === "stale") {
    const projectionMatchesIdentity = projection.sessionId === identity.sessionId;
    if (projectionMatchesIdentity) {
      if (projection.reason === "reconnecting") {
        return {
          kind: "suspended",
          placeholder: ["Herdr Pane is reconnecting", "", "This editor will reconnect automatically."].join("\r\n"),
        };
      }
      return {
        kind: "suspended",
        placeholder: [
          "Herdr Pane cannot connect",
          "",
          `Session “${identity.sessionId}” is incompatible with this version of the Herdr extension.`,
        ].join("\r\n"),
      };
    }
  }

  return {
    kind: "suspended",
    placeholder: [
      "Herdr Pane is not connected",
      "",
      `This Pane belongs to Session “${identity.sessionId}”.`,
      "Select that Session in the Herdr Sessions view to reconnect this editor.",
    ].join("\r\n"),
  };
}

export function paneName(pane: HerdrPane | undefined, paneId: string): string {
  return nonEmpty(pane?.terminalTitle) ?? `Pane ${paneId}`;
}

export function observerFailurePlaceholder(selection: SelectedPaneEditor): string {
  return [
    "Herdr Pane observer failed",
    "",
    `The read-only observer for Pane “${selection.paneId}” could not be started.`,
  ].join("\r\n");
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  return undefined;
}
