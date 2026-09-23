import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import type {
  HerdrTerminalObserverEvent,
  HerdrTerminalObserverRequest,
} from "../../../src/capabilities/terminalSurfaces";
import { HerdrCliTerminalObserverFactory } from "../../../src/infrastructure/herdr/cli/HerdrCliTerminalObserverFactory";

const fixture = resolve(process.cwd(), "test/fixtures/terminal-observer/observer-fixture");
const environmentKeys = ["HERDR_TERMINAL_OBSERVER_ARGS_FILE", "HERDR_TERMINAL_OBSERVER_PID_FILE"] as const;
const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));

function setEnvironment(key: (typeof environmentKeys)[number], value: string | undefined): void {
  if (value === undefined) Reflect.deleteProperty(process.env, key);
  else process.env[key] = value;
}

function request(terminalId: string, sessionId = "named-session"): HerdrTerminalObserverRequest {
  return { executable: fixture, sessionId, terminalId, columns: 120, rows: 35 };
}

function observe(nextRequest: HerdrTerminalObserverRequest) {
  const events: HerdrTerminalObserverEvent[] = [];
  const logger = { info: () => undefined, error: () => undefined, show: () => undefined };
  const attempt = new HerdrCliTerminalObserverFactory(logger).start(nextRequest, (event) => events.push(event));
  return { attempt, events };
}

async function waitForOutcome(events: readonly HerdrTerminalObserverEvent[]): Promise<HerdrTerminalObserverEvent> {
  for (let index = 0; index < 500; index += 1) {
    const outcome = events.find((event) => event.kind !== "frame");
    if (outcome !== undefined) return outcome;
    await delay(10);
  }
  throw new Error("Observer fixture did not produce an outcome within five seconds.");
}

async function waitForFile(path: string): Promise<void> {
  for (let index = 0; index < 500; index += 1) {
    try {
      await readFile(path, "utf8");
      return;
    } catch {
      await delay(10);
    }
  }
  throw new Error(`Observer fixture did not create ${path}.`);
}

async function waitForProcessExit(pid: number): Promise<void> {
  for (let index = 0; index < 200; index += 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (isErrno(error) && error.code === "ESRCH") return;
      throw error;
    }
    await delay(10);
  }
  throw new Error(`Observer child process ${pid} remained alive after disposal.`);
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

afterEach(() => {
  for (const key of environmentKeys) setEnvironment(key, originalEnvironment.get(key));
});

describe("Herdr CLI terminal observer adapter", () => {
  it("targets the named Session and parses chunked NDJSON, base64 ANSI, additive records, and split UTF-8", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-observer-"));
    const argsPath = join(directory, "args.json");
    setEnvironment("HERDR_TERMINAL_OBSERVER_ARGS_FILE", argsPath);
    const run = observe(request("fixture-stream"));
    try {
      const outcome = await waitForOutcome(run.events);
      expect(outcome).toEqual({ kind: "closed", reason: "fixture complete" });
      expect(run.events).toEqual([
        { kind: "frame", ansi: "\u001b[31mREADY\u001b[0m", full: true },
        { kind: "frame", ansi: "", full: false },
        { kind: "frame", ansi: "€", full: false },
        { kind: "closed", reason: "fixture complete" },
      ]);
      expect(JSON.parse(await readFile(argsPath, "utf8")) as unknown).toEqual([
        "--session",
        "named-session",
        "terminal",
        "session",
        "observe",
        "fixture-stream",
        "--cols",
        "120",
        "--rows",
        "35",
      ]);
    } finally {
      run.attempt.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uses the default Session syntax and treats clean unexpected EOF as transport loss", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-observer-"));
    const argsPath = join(directory, "args.json");
    setEnvironment("HERDR_TERMINAL_OBSERVER_ARGS_FILE", argsPath);
    const run = observe(request("fixture-eof", "default"));
    try {
      expect(await waitForOutcome(run.events)).toMatchObject({ kind: "transport-lost", diagnostic: /exit code 0/ });
      expect(run.events[0]).toEqual({ kind: "frame", ansi: "before eof", full: true });
      expect(JSON.parse(await readFile(argsPath, "utf8")) as unknown).toEqual([
        "terminal",
        "session",
        "observe",
        "fixture-eof",
        "--cols",
        "120",
        "--rows",
        "35",
      ]);
    } finally {
      run.attempt.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["fixture-invalid-json", "invalid JSON"],
    ["fixture-invalid-frame", "invalid known frame"],
    ["fixture-invalid-closed", "invalid known close record"],
  ])("faults and reaps the attempt for %s (%s)", async (terminalId) => {
    const run = observe(request(terminalId));
    try {
      expect(await waitForOutcome(run.events)).toMatchObject({ kind: "fault" });
      expect(run.events).toHaveLength(1);
    } finally {
      run.attempt.dispose();
    }
  });

  it("treats terminal.closed as stream end when the child exits with status zero", async () => {
    const run = observe(request("fixture-closed-zero"));
    try {
      expect(await waitForOutcome(run.events)).toEqual({ kind: "closed", reason: "clean exit" });
      expect(run.events).toEqual([{ kind: "closed", reason: "clean exit" }]);
    } finally {
      run.attempt.dispose();
    }
  });

  it("terminates the controlled child on attempt disposal without producing a Herdr mutation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-observer-"));
    const pidPath = join(directory, "pid");
    setEnvironment("HERDR_TERMINAL_OBSERVER_PID_FILE", pidPath);
    const run = observe(request("fixture-hang"));
    try {
      await waitForFile(pidPath);
      const pid = Number(await readFile(pidPath, "utf8"));
      expect(Number.isInteger(pid)).toBe(true);
      run.attempt.dispose();
      await waitForProcessExit(pid);
      expect(run.events).toEqual([]);
    } finally {
      run.attempt.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
