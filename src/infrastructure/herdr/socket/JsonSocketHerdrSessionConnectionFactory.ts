import type { Logger } from "@core/logger";
import type {
  HerdrResolvedSession,
  HerdrSessionConnection,
  HerdrSessionConnectionFactory,
} from "@capabilities/sessions";
import { JsonSocketHerdrSessionConnection } from "./JsonSocketHerdrSessionConnection";
import type { HerdrSocketConnector } from "./NodeHerdrSocketConnector";

const defaultRequestTimeoutMs = 5_000;
const defaultConnectTimeoutMs = 5_000;

export class JsonSocketHerdrSessionConnectionFactory implements HerdrSessionConnectionFactory {
  private readonly connector: HerdrSocketConnector;
  private readonly logger: Logger;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;

  constructor(
    logger: Logger,
    connector: HerdrSocketConnector,
    requestTimeoutMs = defaultRequestTimeoutMs,
    connectTimeoutMs = defaultConnectTimeoutMs,
  ) {
    this.logger = logger;
    this.connector = connector;
    this.requestTimeoutMs = requestTimeoutMs;
    this.connectTimeoutMs = connectTimeoutMs;
  }

  create(session: HerdrResolvedSession): HerdrSessionConnection {
    return new JsonSocketHerdrSessionConnection(
      session,
      this.connector,
      this.logger,
      this.requestTimeoutMs,
      this.connectTimeoutMs,
    );
  }
}
