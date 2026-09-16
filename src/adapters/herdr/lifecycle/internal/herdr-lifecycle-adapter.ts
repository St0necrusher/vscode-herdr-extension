import type {
  HerdrDiscoveryResult,
  HerdrLifecyclePort,
  HerdrSettings,
} from "../../../../features/lifecycle/index.js";
import type { ProcessRunner } from "./process-runner.js";

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

export function createHerdrLifecycleAdapter(dependencies: {
  runner: ProcessRunner;
}): HerdrLifecyclePort {
  return {
    async inspect(settings) {
      let sessions: SessionRecord[];
      try {
        const response = await dependencies.runner.run(settings.executable, [
          "session",
          "list",
          "--json",
        ]);
        sessions = parseSessionList(response.stdout);
      } catch (error) {
        if (isMissingExecutable(error)) {
          return {
            kind: "missing-binary",
            settings,
            detail: `Herdr executable was not found: ${settings.executable}`,
          };
        }
        return errorAvailability(settings, error);
      }

      const session = sessions.find((candidate) =>
        settings.session === "default"
          ? candidate.default || candidate.name === "default"
          : candidate.name === settings.session,
      );
      if (session?.running !== true) {
        return {
          kind: "stopped",
          settings,
          detail: `The ${formatSession(settings.session)} Herdr Session is stopped.`,
        };
      }

      try {
        const response = await dependencies.runner.run(
          settings.executable,
          statusArgs(settings),
        );
        return availabilityFromStatus(settings, parseStatus(response.stdout));
      } catch (error) {
        if (isMissingExecutable(error)) {
          return {
            kind: "missing-binary",
            settings,
            detail: `Herdr executable was not found: ${settings.executable}`,
          };
        }
        return errorAvailability(settings, error);
      }
    },
    start(settings) {
      return dependencies.runner.spawnDetached(
        settings.executable,
        serverArgs(settings),
      );
    },
  };
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

function availabilityFromStatus(
  settings: HerdrSettings,
  status: StatusRecord,
): HerdrDiscoveryResult {
  const server = status.server;
  if (server?.running !== true) {
    return {
      kind: "stopped",
      settings,
      detail: `The ${formatSession(settings.session)} Herdr Session is stopped.`,
    };
  }

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
      settings,
      detail: `The ${formatSession(settings.session)} Herdr Session is incompatible.`,
      ...(version === undefined ? {} : { version }),
      ...(protocol === undefined ? {} : { protocol }),
      ...(endpoint === undefined ? {} : { endpoint }),
    };
  }

  return {
    kind: "connected",
    settings,
    detail: `Connected to the ${formatSession(settings.session)} Herdr Session.`,
    version,
    protocol,
    endpoint,
  };
}

function statusArgs(settings: HerdrSettings): string[] {
  return settings.session === "default"
    ? ["status", "--json"]
    : ["--session", settings.session, "status", "--json"];
}

function serverArgs(settings: HerdrSettings): string[] {
  return settings.session === "default"
    ? ["server"]
    : ["--session", settings.session, "server"];
}

function formatSession(session: string): string {
  return session === "default" ? "default" : `"${session}"`;
}

function errorAvailability(
  settings: HerdrSettings,
  error: unknown,
): HerdrDiscoveryResult {
  return {
    kind: "error",
    settings,
    detail: processErrorMessage(error),
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
