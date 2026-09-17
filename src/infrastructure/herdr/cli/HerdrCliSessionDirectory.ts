import type {
  HerdrConfiguration,
  HerdrSessionDirectory,
  HerdrSessionDiscovery,
} from "#capabilities/sessions";
import type { ProcessRunner } from "./ProcessRunner.js";

interface SessionRecord {
  name: string;
  default: boolean;
  running: boolean;
  socket_path?: string;
}

interface StatusRecord {
  client?: { version?: string; protocol?: number };
  server?: {
    running?: boolean;
    version?: string;
    protocol?: number;
    compatible?: boolean;
    endpoint_compatible?: boolean;
    socket?: string;
  };
}

export class HerdrCliSessionDirectory implements HerdrSessionDirectory {
  readonly #runner: ProcessRunner;

  constructor(runner: ProcessRunner) {
    this.#runner = runner;
  }

  async discover(
    configuration: HerdrConfiguration,
  ): Promise<HerdrSessionDiscovery> {
    let sessions: SessionRecord[];
    try {
      const response = await this.#runner.run(configuration.executable, [
        "session",
        "list",
        "--json",
      ]);
      sessions = parseSessionList(response.stdout);
    } catch (error) {
      return isMissingExecutable(error)
        ? missingExecutable(configuration)
        : discoveryError(configuration, error);
    }

    const session = sessions.find((candidate) =>
      configuration.session === "default"
        ? candidate.default || candidate.name === "default"
        : candidate.name === configuration.session,
    );
    if (session?.running !== true) return stopped(configuration);

    try {
      const response = await this.#runner.run(
        configuration.executable,
        statusArgs(configuration),
      );
      return discoveryFromStatus(configuration, parseStatus(response.stdout));
    } catch (error) {
      return isMissingExecutable(error)
        ? missingExecutable(configuration)
        : discoveryError(configuration, error);
    }
  }

  start(configuration: HerdrConfiguration): Promise<void> {
    return this.#runner.spawnDetached(
      configuration.executable,
      serverArgs(configuration),
    );
  }
}

function parseSessionList(stdout: string): SessionRecord[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed) || !Array.isArray(parsed.sessions)) {
    throw new Error("Herdr returned an invalid Session list.");
  }
  return parsed.sessions.filter(isSessionRecord);
}

function parseStatus(stdout: string): StatusRecord {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) throw new Error("Herdr returned an invalid status.");
  return parsed;
}

function discoveryFromStatus(
  configuration: HerdrConfiguration,
  status: StatusRecord,
): HerdrSessionDiscovery {
  const server = status.server;
  if (server?.running !== true) return stopped(configuration);

  const version = server.version ?? status.client?.version;
  const protocol = server.protocol ?? status.client?.protocol;
  const endpoint = server.socket;
  if (
    server.compatible !== true ||
    server.endpoint_compatible !== true ||
    version === undefined ||
    protocol === undefined ||
    endpoint === undefined
  ) {
    return {
      kind: "incompatible",
      configuration,
      ...(version === undefined ? {} : { version }),
      ...(protocol === undefined ? {} : { protocol }),
      ...(endpoint === undefined ? {} : { endpoint }),
    };
  }

  return {
    kind: "connected",
    configuration,
    version,
    protocol,
    endpoint,
  };
}

function statusArgs(configuration: HerdrConfiguration): string[] {
  return configuration.session === "default"
    ? ["status", "--json"]
    : ["--session", configuration.session, "status", "--json"];
}

function serverArgs(configuration: HerdrConfiguration): string[] {
  return configuration.session === "default"
    ? ["server"]
    : ["--session", configuration.session, "server"];
}

function missingExecutable(
  configuration: HerdrConfiguration,
): HerdrSessionDiscovery {
  return { kind: "missing-executable", configuration };
}

function stopped(configuration: HerdrConfiguration): HerdrSessionDiscovery {
  return { kind: "stopped", configuration };
}

function discoveryError(
  configuration: HerdrConfiguration,
  error: unknown,
): HerdrSessionDiscovery {
  return {
    kind: "error",
    configuration,
    diagnostic: processErrorMessage(error),
  };
}

function processErrorMessage(error: unknown): string {
  if (
    isRecord(error) &&
    typeof error.stderr === "string" &&
    error.stderr.trim()
  ) {
    return error.stderr.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

function isMissingExecutable(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isSessionRecord(value: unknown): value is SessionRecord {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.default === "boolean" &&
    typeof value.running === "boolean" &&
    (value.socket_path === undefined || typeof value.socket_path === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
