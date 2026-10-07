export type HerdrConnectionFailure =
  | Readonly<{ kind: "transport"; diagnostic: string }>
  | Readonly<{
      kind: "herdr-error";
      code: string;
      message: string;
      operation: "ping" | "subscribe" | "snapshot";
    }>
  | Readonly<{
      kind: "incompatible";
      diagnostic: string;
      version?: string;
      protocol?: number;
      endpointProtocolGeneration?: number;
    }>
  | Readonly<{ kind: "invalid-response"; diagnostic: string }>;

export class HerdrConnectionFailureError extends Error {
  readonly failure: HerdrConnectionFailure;

  constructor(failure: HerdrConnectionFailure) {
    super(connectionFailureMessage(failure));
    this.name = "HerdrConnectionFailureError";
    this.failure = failure;
  }
}

function connectionFailureMessage(failure: HerdrConnectionFailure): string {
  switch (failure.kind) {
    case "transport":
    case "incompatible":
    case "invalid-response":
      return failure.diagnostic;
    case "herdr-error":
      return failure.message;
  }
}
