import { describe, expect, it, vi } from "vitest";
import { HerdrCliSessionDirectory } from "./HerdrCliSessionDirectory";
import type { ProcessRunner } from "@core/process";

function result(value: unknown) {
  return { stdout: JSON.stringify(value), stderr: "" };
}

function createRunner(outputs: (ReturnType<typeof result> | Error)[]) {
  const run = vi.fn(() => {
    const output = outputs.shift();
    if (output instanceof Error) return Promise.reject(output);
    if (output === undefined) return Promise.reject(new Error("No process result"));
    return Promise.resolve(output);
  });
  const spawnDetached = vi.fn(() => Promise.resolve());
  return {
    runner: { run, spawnDetached } satisfies ProcessRunner,
    spawnDetached,
  };
}

const executable = "herdr";

function sessionList() {
  return result({
    sessions: [
      {
        default: true,
        name: "default",
        running: true,
        socket_path: "/tmp/default.sock",
        unknown_field: "ignored",
      },
      {
        default: false,
        name: "work",
        running: false,
        unknown_field: "ignored",
      },
    ],
    unknown_root_field: "ignored",
  });
}

describe("Herdr CLI Session directory", () => {
  it("maps all known Sessions and their availability", async () => {
    const { runner } = createRunner([sessionList()]);

    await expect(new HerdrCliSessionDirectory(runner).list(executable)).resolves.toEqual({
      kind: "success",
      sessions: [
        { id: "default", isDefault: true, availability: "running", endpoint: "/tmp/default.sock" },
        { id: "work", isDefault: false, availability: "stopped" },
      ],
    });
  });

  it("resolves a named running Session from its listed endpoint", async () => {
    const { runner } = createRunner([sessionList()]);

    await expect(new HerdrCliSessionDirectory(runner).resolve(executable, "default")).resolves.toEqual({
      id: "default",
      endpoint: "/tmp/default.sock",
    });
  });

  it("resolves the default endpoint through status when the list has no socket path", async () => {
    const { runner } = createRunner([
      result({
        sessions: [{ default: true, name: "default", running: true }],
      }),
      result({ server: { running: true, socket: "/tmp/status.sock" }, unknown_field: "ignored" }),
    ]);

    await expect(new HerdrCliSessionDirectory(runner).resolve(executable, "default")).resolves.toEqual({
      id: "default",
      endpoint: "/tmp/status.sock",
    });
    expect(runner.run).toHaveBeenNthCalledWith(2, "herdr", ["status", "--json"]);
  });

  it("rejects a stopped or endpoint-less Session", async () => {
    const { runner } = createRunner([result({ sessions: [{ default: false, name: "work", running: false }] })]);
    const directory = new HerdrCliSessionDirectory(runner);

    await expect(directory.resolve(executable, "work")).rejects.toThrow('Herdr Session "work" is stopped.');
  });

  it("maps a missing executable and process failure", async () => {
    const missing = Object.assign(new Error("spawn herdr ENOENT"), { code: "ENOENT" });
    const first = createRunner([missing]);
    await expect(new HerdrCliSessionDirectory(first.runner).list(executable)).resolves.toEqual({
      kind: "missing-executable",
    });

    const failure = Object.assign(new Error("Herdr failed"), { stderr: "Session discovery failed" });
    const second = createRunner([failure]);
    await expect(new HerdrCliSessionDirectory(second.runner).list(executable)).resolves.toEqual({
      kind: "failure",
      diagnostic: "Session discovery failed",
    });
  });

  it("starts the explicitly selected Herdr Session with the supported command", async () => {
    const { runner, spawnDetached } = createRunner([]);
    const directory = new HerdrCliSessionDirectory(runner);

    await directory.start("/usr/local/bin/herdr", "work");

    expect(spawnDetached).toHaveBeenCalledWith("/usr/local/bin/herdr", ["--session", "work", "server"]);
  });
});
