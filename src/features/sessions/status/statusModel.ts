import type { HerdrConnectionFailure } from "@capabilities/sessions";
import type { HerdrStatusModel, SessionsState } from "../capabilities";

const standardActions = ["retry", "open-settings", "show-diagnostics"] as const;

export function statusModel(state: SessionsState): HerdrStatusModel {
  const active = state.active;
  const identity = {
    herdrSession: active.kind !== "unselected" ? active.session.id : state.configuration.session,
    executable: state.configuration.executable,
  };
  if (state.catalog.kind !== "ready") {
    if (state.catalog.kind === "checking") return { ...identity, kind: "checking", availableActions: standardActions };
    if (state.catalog.kind === "missing-executable")
      return { ...identity, kind: "missing-executable", availableActions: ["select-executable", ...standardActions] };
    return { ...identity, kind: "error", diagnostic: state.catalog.diagnostic, availableActions: standardActions };
  }
  switch (active.kind) {
    case "unselected":
      return { ...identity, kind: "checking", availableActions: standardActions };
    case "selected-stopped":
      return { ...identity, kind: "stopped", availableActions: ["start", ...standardActions] };
    case "start-failed":
      return { ...identity, kind: "error", diagnostic: active.diagnostic, availableActions: standardActions };
    case "resolving":
      return { ...identity, kind: "resolving", availableActions: standardActions };
    case "connecting":
      return { ...identity, kind: "connecting", availableActions: standardActions };
    case "connected":
      return {
        ...identity,
        kind: "connected",
        version: active.metadata.version,
        protocol: active.metadata.protocol,
        endpoint: active.endpoint,
        availableActions: standardActions,
      };
    case "reconnecting":
      return {
        ...identity,
        kind: "reconnecting",
        diagnostic: failureDiagnostic(active.failure),
        phase: active.phase.kind,
        ...(active.phase.kind === "waiting" ? { retryAt: active.phase.retryAt } : {}),
        ...(active.staleProjection === undefined ? {} : { version: active.staleProjection.metadata.version }),
        ...(active.staleProjection === undefined ? {} : { protocol: active.staleProjection.metadata.protocol }),
        ...(active.endpoint === undefined ? {} : { endpoint: active.endpoint }),
        availableActions: standardActions,
      };
    case "incompatible":
      return {
        ...identity,
        kind: "incompatible",
        diagnostic: active.failure.diagnostic,
        ...(active.failure.version === undefined ? {} : { version: active.failure.version }),
        ...(active.failure.protocol === undefined ? {} : { protocol: active.failure.protocol }),
        ...(active.endpoint === undefined ? {} : { endpoint: active.endpoint }),
        availableActions: standardActions,
      };
  }
}

function failureDiagnostic(failure: HerdrConnectionFailure): string {
  return failure.kind === "herdr-error" ? `${failure.code}: ${failure.message}` : failure.diagnostic;
}
