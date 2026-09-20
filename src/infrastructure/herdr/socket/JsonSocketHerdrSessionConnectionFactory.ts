import type { HerdrLogger } from "#capabilities/runtime";
import type {
  HerdrResolvedSession,
  HerdrSessionConnection,
  HerdrSessionConnectionFactory,
} from "#capabilities/sessions";
import { JsonSocketHerdrSessionConnection } from "./JsonSocketHerdrSessionConnection.js";
import type { HerdrSocketConnector } from "./NodeHerdrSocketConnector.js";

const defaultRequestTimeoutMs = 5_000;
const defaultConnectTimeoutMs = 5_000;

export class JsonSocketHerdrSessionConnectionFactory implements HerdrSessionConnectionFactory {
  private readonly connector: HerdrSocketConnector;
  private readonly logger: HerdrLogger;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;

  constructor(
    logger: HerdrLogger,
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
