import { HerdrConnectionFailureError } from "@capabilities/sessions";
import type { HerdrSessionMetadata } from "@capabilities/sessions";
export type HerdrProtocolRecord = Record<string, unknown>;

export const supportedProtocol = 22;
export const supportedEndpointProtocolGeneration = 1;

export function requireResultType(result: HerdrProtocolRecord, expected: string): void {
  if (result.type !== expected) throw invalidResponse(`Unexpected Herdr response; expected ${expected}.`);
}

export function parsePongResult(result: HerdrProtocolRecord): HerdrSessionMetadata {
  requireResultType(result, "pong");
  const version = requiredString(result, "version", "ping");
  const protocol = requiredNumber(result, "protocol", "ping");
  const capabilitiesValue = result.capabilities;
  if (capabilitiesValue !== undefined && capabilitiesValue !== null && !isRecord(capabilitiesValue)) {
    throw invalidResponse("Herdr returned invalid capability metadata.");
  }
  const parsedCapabilities =
    capabilitiesValue === null || capabilitiesValue === undefined ? undefined : parseCapabilities(capabilitiesValue);
  const capabilities = parsedCapabilities?.capabilities;
  const endpointProtocolGeneration = parsedCapabilities?.endpointProtocolGeneration;
  if (protocol !== supportedProtocol) {
    throw incompatible(`Unsupported Herdr protocol ${protocol}; expected ${supportedProtocol}.`, {
      version,
      protocol,
      ...(endpointProtocolGeneration === undefined ? {} : { endpointProtocolGeneration }),
    });
  }
  if (endpointProtocolGeneration !== undefined && endpointProtocolGeneration !== supportedEndpointProtocolGeneration) {
    throw incompatible(
      `Unsupported Herdr endpoint protocol generation ${endpointProtocolGeneration}; expected ${supportedEndpointProtocolGeneration}.`,
      { version, protocol, endpointProtocolGeneration },
    );
  }
  return {
    version,
    protocol,
    ...(endpointProtocolGeneration === undefined ? {} : { endpointProtocolGeneration }),
    ...(capabilities === undefined ? {} : { capabilities }),
  };
}

function parseCapabilities(value: HerdrProtocolRecord): Readonly<{
  capabilities: NonNullable<HerdrSessionMetadata["capabilities"]>;
  endpointProtocolGeneration?: number;
}> {
  const capability = (key: string): boolean | undefined => {
    const candidate = value[key];
    if (candidate === undefined) return undefined;
    if (typeof candidate !== "boolean") throw invalidResponse(`Herdr returned invalid capability "${key}".`);
    return candidate;
  };
  const endpointProtocolGeneration = value.endpoint_protocol_generation;
  if (
    endpointProtocolGeneration !== undefined &&
    endpointProtocolGeneration !== null &&
    (typeof endpointProtocolGeneration !== "number" || !Number.isSafeInteger(endpointProtocolGeneration))
  ) {
    throw invalidResponse("Herdr returned an invalid endpoint protocol generation.");
  }
  const detachedServerDaemon = capability("detached_server_daemon");
  const healthCheck = capability("health_check");
  const liveHandoff = capability("live_handoff");
  const surfaceInterest = capability("surface_interest");
  return {
    capabilities: {
      ...(detachedServerDaemon === undefined ? {} : { detachedServerDaemon }),
      ...(healthCheck === undefined ? {} : { healthCheck }),
      ...(liveHandoff === undefined ? {} : { liveHandoff }),
      ...(surfaceInterest === undefined ? {} : { surfaceInterest }),
    },
    ...(endpointProtocolGeneration === undefined || endpointProtocolGeneration === null
      ? {}
      : { endpointProtocolGeneration }),
  };
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

function isRecord(value: unknown): value is HerdrProtocolRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function herdrError(
  operation: "ping" | "subscribe" | "snapshot",
  error: HerdrProtocolRecord,
): HerdrConnectionFailureError {
  const code = typeof error.code === "string" ? error.code : "unknown_error";
  const message = typeof error.message === "string" ? error.message : "Herdr request failed.";
  return new HerdrConnectionFailureError({ kind: "herdr-error", code, message, operation });
}

export function invalidResponse(diagnostic: string): HerdrConnectionFailureError {
  return new HerdrConnectionFailureError({ kind: "invalid-response", diagnostic });
}

export function incompatible(
  diagnostic: string,
  metadata: Readonly<{
    version?: string;
    protocol?: number;
    endpointProtocolGeneration?: number;
  }>,
): HerdrConnectionFailureError {
  return new HerdrConnectionFailureError({ kind: "incompatible", diagnostic, ...metadata });
}
