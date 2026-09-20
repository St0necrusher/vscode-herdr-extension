import type {
  HerdrConfiguration,
  HerdrResolvedSession,
  HerdrSessionDescriptor,
  HerdrSessionDirectory,
  HerdrSessionListResult,
} from "#capabilities/sessions";
import type { ProcessRunner } from "./ProcessRunner.js";

interface SessionRecord {
  name: string;
  default: boolean;
  running: boolean;
  socket_path?: string;
}

interface StatusRecord {
  server?: {
    running?: boolean;
    socket?: string;
  };
}

export class HerdrCliSessionDirectory implements HerdrSessionDirectory {
  private readonly runner: ProcessRunner;

  constructor(runner: ProcessRunner) {
    this.runner = runner;
  }

  async list(configuration: HerdrConfiguration): Promise<HerdrSessionListResult> {
    try {
      const response = await this.runner.run(configuration.executable, ["session", "list", "--json"]);
      const sessions = parseSessionList(response.stdout);
      return {
        kind: "success",
        sessions: sessions.map(toDescriptor),
      };
    } catch (error) {
      return isMissingExecutable(error) ? { kind: "missing-executable" } : listFailure(error);
    }
  }

  async resolve(configuration: HerdrConfiguration, sessionId: string): Promise<HerdrResolvedSession> {
    const response = await this.runner.run(configuration.executable, ["session", "list", "--json"]);
    const sessions = parseSessionList(response.stdout);
    const session = sessions.find((candidate) => candidate.name === sessionId);
    if (session === undefined) throw new Error(`Herdr Session "${sessionId}" is no longer known.`);
    if (!session.running) throw new Error(`Herdr Session "${sessionId}" is stopped.`);

    if (session.socket_path !== undefined && session.socket_path.length > 0) {
      return { id: sessionId, endpoint: session.socket_path };
    }

    const statusResponse = await this.runner.run(configuration.executable, statusArgs(sessionId));
    const status = parseStatus(statusResponse.stdout);
    if (
      status.server?.running !== true ||
      typeof status.server.socket !== "string" ||
      status.server.socket.length === 0
    ) {
      throw new Error(`Herdr Session "${sessionId}" has no running endpoint.`);
    }
    return { id: sessionId, endpoint: status.server.socket };
  }

  async start(configuration: HerdrConfiguration, sessionId: string): Promise<void> {
    await this.runner.spawnDetached(configuration.executable, serverArgs(sessionId));
  }
}

function parseSessionList(stdout: string): SessionRecord[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed) || !Array.isArray(parsed.sessions)) {
    throw new Error("Herdr returned an invalid Session list.");
  }
  return parsed.sessions.map((value) => {
    if (!isSessionRecord(value)) throw new Error("Herdr returned an invalid Session record.");
    return value;
  });
}

function parseStatus(stdout: string): StatusRecord {
  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) throw new Error("Herdr returned an invalid status.");
  return parsed;
}

function toDescriptor(session: SessionRecord): HerdrSessionDescriptor {
  return {
    id: session.name,
    isDefault: session.default,
    availability: session.running ? "running" : "stopped",
    ...(session.running && session.socket_path !== undefined ? { endpoint: session.socket_path } : {}),
  };
}

function statusArgs(sessionId: string): string[] {
  return sessionId === "default" ? ["status", "--json"] : ["--session", sessionId, "status", "--json"];
}

function serverArgs(sessionId: string): string[] {
  return sessionId === "default" ? ["server"] : ["--session", sessionId, "server"];
}

function listFailure(error: unknown): HerdrSessionListResult {
  return {
    kind: "failure",
    diagnostic: processErrorMessage(error),
  };
}

function processErrorMessage(error: unknown): string {
  if (isRecord(error) && typeof error.stderr === "string" && error.stderr.trim()) return error.stderr.trim();
  return error instanceof Error ? error.message : String(error);
}

function isMissingExecutable(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isSessionRecord(value: unknown): value is SessionRecord {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.default === "boolean" &&
    typeof value.running === "boolean" &&
    (value.socket_path === undefined || typeof value.socket_path === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
