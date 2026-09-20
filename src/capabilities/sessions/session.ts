export type HerdrSessionId = string;

export type HerdrSessionDescriptor = Readonly<{
  id: HerdrSessionId;
  isDefault: boolean;
  availability: "running" | "stopped";
  endpoint?: string;
}>;

export type HerdrSessionMetadata = Readonly<{
  version: string;
  protocol: number;
  endpointProtocolGeneration?: number;
  capabilities?: Readonly<{
    detachedServerDaemon?: boolean;
    healthCheck?: boolean;
    liveHandoff?: boolean;
    surfaceInterest?: boolean;
  }>;
}>;

export type HerdrResolvedSession = Readonly<{
  id: HerdrSessionId;
  endpoint: string;
}>;
