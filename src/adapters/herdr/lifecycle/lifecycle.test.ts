import { describe, expect, it, vi } from "vitest";
import { createHerdrLifecycleAdapter, type ProcessRunner } from "./index.js";

function result(value: unknown) {
  return { stdout: JSON.stringify(value), stderr: "" };
}

function createRunner(outputs: (ReturnType<typeof result> | Error)[]) {
  const run = vi.fn(() => {
    const output = outputs.shift();
    if (output instanceof Error) return Promise.reject(output);
    if (output === undefined)
      return Promise.reject(new Error("No fake process result"));
    return Promise.resolve(output);
  });
  const spawnDetached = vi.fn(() => Promise.resolve());
  return {
    runner: { run, spawnDetached } satisfies ProcessRunner,
    run,
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

describe("Herdr lifecycle adapter", () => {
  it("distinguishes a missing executable", async () => {
    const missing = Object.assign(new Error("spawn herdr ENOENT"), {
      code: "ENOENT",
    });
    const { runner } = createRunner([missing]);
    const adapter = createHerdrLifecycleAdapter({ runner });

    await expect(adapter.inspect(defaults)).resolves.toMatchObject({
      kind: "missing-binary",
      settings: defaults,
    });
  });

  it("distinguishes a stopped default Session", async () => {
    const { runner } = createRunner([sessionList(false)]);
    const adapter = createHerdrLifecycleAdapter({ runner });

    await expect(adapter.inspect(defaults)).resolves.toEqual({
      kind: "stopped",
      settings: defaults,
      detail: "The default Herdr Session is stopped.",
    });
  });

  it("reports a compatible running Session with diagnostics", async () => {
    const { runner } = createRunner([
      sessionList(true),
      result({
        client: { version: "0.9.0", protocol: 22 },
        server: {
          status: "running",
          running: true,
          version: "0.9.0",
          protocol: 22,
          compatible: true,
          endpoint_compatible: true,
          socket: "/tmp/herdr.sock",
        },
      }),
    ]);
    const adapter = createHerdrLifecycleAdapter({ runner });

    await expect(adapter.inspect(defaults)).resolves.toEqual({
      kind: "connected",
      settings: defaults,
      detail: "Connected to the default Herdr Session.",
      version: "0.9.0",
      protocol: 22,
      endpoint: "/tmp/herdr.sock",
    });
  });

  it("blocks an incompatible running Session", async () => {
    const { runner } = createRunner([
      sessionList(true),
      result({
        client: { version: "0.9.0", protocol: 22 },
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
    const adapter = createHerdrLifecycleAdapter({ runner });

    await expect(adapter.inspect(defaults)).resolves.toMatchObject({
      kind: "incompatible",
      version: "1.0.0",
      protocol: 23,
      endpoint: "/tmp/herdr.sock",
    });
  });

  it("starts the selected Session through the official headless server command", async () => {
    const { runner, spawnDetached } = createRunner([]);
    const adapter = createHerdrLifecycleAdapter({ runner });

    await adapter.start({
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
