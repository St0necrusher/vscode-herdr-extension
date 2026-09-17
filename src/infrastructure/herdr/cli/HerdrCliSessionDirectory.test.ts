import { describe, expect, it, vi } from "vitest";
import { HerdrCliSessionDirectory, type ProcessRunner } from "./index.js";

function result(value: unknown) {
  return { stdout: JSON.stringify(value), stderr: "" };
}

function createRunner(outputs: (ReturnType<typeof result> | Error)[]) {
  const run = vi.fn(() => {
    const output = outputs.shift();
    if (output instanceof Error) return Promise.reject(output);
    if (output === undefined)
      return Promise.reject(new Error("No process result"));
    return Promise.resolve(output);
  });
  const spawnDetached = vi.fn(() => Promise.resolve());
  return {
    runner: { run, spawnDetached } satisfies ProcessRunner,
    spawnDetached,
  };
}

const defaults = { executable: "herdr", session: "default" };

function sessionList(running: boolean) {
  return result({
    sessions: [
      {
        default: true,
        name: "default",
        running,
        socket_path: "/tmp/herdr.sock",
      },
    ],
  });
}

describe("Herdr CLI Session directory", () => {
  it("maps a missing executable", async () => {
    const missing = Object.assign(new Error("spawn herdr ENOENT"), {
      code: "ENOENT",
    });
    const { runner } = createRunner([missing]);

    await expect(
      new HerdrCliSessionDirectory(runner).discover(defaults),
    ).resolves.toMatchObject({
      kind: "missing-executable",
      configuration: defaults,
    });
  });

  it("maps a stopped Herdr Session", async () => {
    const { runner } = createRunner([sessionList(false)]);

    await expect(
      new HerdrCliSessionDirectory(runner).discover(defaults),
    ).resolves.toEqual({
      kind: "stopped",
      configuration: defaults,
    });
  });

  it("maps a process failure to an error with its diagnostic", async () => {
    const failure = Object.assign(new Error("Herdr failed"), {
      stderr: "Session discovery failed",
    });
    const { runner } = createRunner([failure]);

    await expect(
      new HerdrCliSessionDirectory(runner).discover(defaults),
    ).resolves.toEqual({
      kind: "error",
      configuration: defaults,
      diagnostic: "Session discovery failed",
    });
  });

  it("maps a compatible connected Herdr Session", async () => {
    const { runner } = createRunner([
      sessionList(true),
      result({
        client: { version: "0.9.0", protocol: 22 },
        server: {
          running: true,
          version: "0.9.0",
          protocol: 22,
          compatible: true,
          endpoint_compatible: true,
          socket: "/tmp/herdr.sock",
        },
      }),
    ]);

    await expect(
      new HerdrCliSessionDirectory(runner).discover(defaults),
    ).resolves.toEqual({
      kind: "connected",
      configuration: defaults,
      version: "0.9.0",
      protocol: 22,
      endpoint: "/tmp/herdr.sock",
    });
  });

  it("maps an incompatible running Herdr Session", async () => {
    const { runner } = createRunner([
      sessionList(true),
      result({
        server: {
          running: true,
          version: "1.0.0",
          protocol: 23,
          compatible: false,
          endpoint_compatible: false,
          socket: "/tmp/herdr.sock",
        },
      }),
    ]);

    await expect(
      new HerdrCliSessionDirectory(runner).discover(defaults),
    ).resolves.toMatchObject({
      kind: "incompatible",
      version: "1.0.0",
      protocol: 23,
      endpoint: "/tmp/herdr.sock",
    });
  });

  it("starts the selected Herdr Session with the supported command", async () => {
    const { runner, spawnDetached } = createRunner([]);
    const directory = new HerdrCliSessionDirectory(runner);

    await directory.start({
      executable: "/usr/local/bin/herdr",
      session: "work",
    });

    expect(spawnDetached).toHaveBeenCalledWith("/usr/local/bin/herdr", [
      "--session",
      "work",
      "server",
    ]);
  });
});
