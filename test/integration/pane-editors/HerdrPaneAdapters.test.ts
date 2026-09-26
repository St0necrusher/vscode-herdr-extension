import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { HerdrLogger } from "../../../src/capabilities/runtime";
import type { PaneOutputSink } from "../../../src/infrastructure/pane-editors/PaneOutputSink";
import { HerdrPaneAttach } from "../../../src/infrastructure/pane-editors/HerdrPaneAttach";
import { HerdrPaneObserver } from "../../../src/infrastructure/pane-editors/HerdrPaneObserver";

type OutputEvent = Readonly<{ kind: "append" | "replace"; data: string }>;
type FakeInvocation = Readonly<{ argv: string[]; configPath: string | undefined; pid: number }>;

const logger: HerdrLogger = {
  info: () => undefined,
  error: () => undefined,
  show: () => undefined,
};

function outputRecorder(): { sink: PaneOutputSink; events: OutputEvent[] } {
  const events: OutputEvent[] = [];
  return {
    sink: {
      append: (data) => events.push({ kind: "append", data }),
      replace: (data) => events.push({ kind: "replace", data }),
    },
    events,
  };
}

async function createFakeHerdr(): Promise<{ directory: string; executable: string; recordPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "herdr-pane-adapters-"));
  const executable = join(directory, "herdr");
  const recordPath = join(directory, "invocation.json");
  const source = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const recordPath = ${JSON.stringify(recordPath)};
const observeIndex = args.indexOf("observe");
const attachIndex = args.indexOf("attach");
const terminalId = args[(observeIndex >= 0 ? observeIndex : attachIndex) + 1];
const recordInvocation = () => fs.writeFileSync(recordPath, JSON.stringify({ argv: args, configPath: process.env.HERDR_CONFIG_PATH, pid: process.pid }));

if (observeIndex >= 0) {
  const emit = (record) => process.stdout.write(JSON.stringify(record) + "\\n");
  if (terminalId === "observer-stubborn") process.on("SIGTERM", () => undefined);
  recordInvocation();
  if (terminalId === "observer-frames") {
    emit({ type: "subscription_started" });
    emit({ type: "terminal.frame", bytes: Buffer.from("snapshot:").toString("base64"), full: true });
    emit({ type: "terminal.frame", bytes: Buffer.from([0xf0, 0x9f]).toString("base64"), full: false });
    emit({ type: "terminal.frame", bytes: Buffer.from([0x99, 0x82]).toString("base64"), full: false });
  }
  if (terminalId === "observer-closed") emit({ type: "terminal.closed", reason: "pane closed" });
  if (terminalId === "observer-exit") setTimeout(() => process.exit(23), 25);
  setInterval(() => undefined, 1_000);
} else if (attachIndex >= 0) {
  if (terminalId !== "attach-exit") {
    if (terminalId === "attach-stubborn") process.on("SIGTERM", () => undefined);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => process.stdout.write("RECEIVED:" + data.toString()));
    process.stdout.on("resize", () => process.stdout.write("SIZE:" + process.stdout.columns + "x" + process.stdout.rows + "\\n"));
  }
  recordInvocation();
  process.stdout.write("ATTACH_READY\\n");
  if (terminalId === "attach-exit") setTimeout(() => process.exit(0), 25);
}
`;
  await writeFile(executable, source, { encoding: "utf8" });
  await chmod(executable, 0o755);
  return { directory, executable, recordPath };
}

function waitForInvocation(recordPath: string): Promise<FakeInvocation> {
  return vi.waitFor(async () => JSON.parse(await readFile(recordPath, "utf8")) as FakeInvocation, {
    timeout: 3_000,
    interval: 10,
  });
}

function processIsGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

async function waitForProcessToExit(pid: number): Promise<void> {
  await vi.waitFor(() => expect(processIsGone(pid)).toBe(true), { timeout: 3_000, interval: 10 });
}

describe("Herdr Pane process adapters", () => {
  it("O3 observer passes its request and maps full and incremental UTF-8 frames to the output sink", async () => {
    const fake = await createFakeHerdr();
    const output = outputRecorder();
    const observer = new HerdrPaneObserver(
      {
        executable: fake.executable,
        sessionId: "work-session",
        terminalId: "observer-frames",
        columns: 101,
        rows: 37,
      },
      output.sink,
      logger,
    );

    try {
      const invocation = await waitForInvocation(fake.recordPath);
      expect(invocation.argv).toEqual([
        "--session",
        "work-session",
        "terminal",
        "session",
        "observe",
        "observer-frames",
        "--cols",
        "101",
        "--rows",
        "37",
      ]);
      await vi.waitFor(
        () => {
          expect(output.events[0]).toEqual({ kind: "replace", data: "snapshot:" });
          const appendedText = output.events
            .filter(({ kind }) => kind === "append")
            .map(({ data }) => data)
            .join("");
          expect(appendedText).toBe("🙂");
        },
        { timeout: 3_000, interval: 10 },
      );
    } finally {
      await observer.stop();
      await rm(fake.directory, { recursive: true, force: true });
    }
  });

  it("O3 observer completion resolves after terminal.closed", async () => {
    const fake = await createFakeHerdr();
    const output = outputRecorder();
    const closedObserver = new HerdrPaneObserver(
      {
        executable: fake.executable,
        sessionId: "default",
        terminalId: "observer-closed",
        columns: 80,
        rows: 24,
      },
      output.sink,
      logger,
    );

    try {
      const invocation = await waitForInvocation(fake.recordPath);
      expect(invocation.argv).toEqual([
        "terminal",
        "session",
        "observe",
        "observer-closed",
        "--cols",
        "80",
        "--rows",
        "24",
      ]);
      await closedObserver.completion;
    } finally {
      await closedObserver.stop();
      await rm(fake.directory, { recursive: true, force: true });
    }
  });

  it("O3 observer completion resolves after an unexpected process exit", async () => {
    const fake = await createFakeHerdr();
    const output = outputRecorder();
    const observer = new HerdrPaneObserver(
      {
        executable: fake.executable,
        sessionId: "default",
        terminalId: "observer-exit",
        columns: 80,
        rows: 24,
      },
      output.sink,
      logger,
    );

    try {
      await waitForInvocation(fake.recordPath);
      await observer.completion;
    } finally {
      await observer.stop();
      await rm(fake.directory, { recursive: true, force: true });
    }
  });

  it("O3 observer stop escalates for a stubborn process, is idempotent, and resolves completion", async () => {
    const fake = await createFakeHerdr();
    const output = outputRecorder();
    const observer = new HerdrPaneObserver(
      {
        executable: fake.executable,
        sessionId: "default",
        terminalId: "observer-stubborn",
        columns: 80,
        rows: 24,
      },
      output.sink,
      logger,
    );

    try {
      const invocation = await waitForInvocation(fake.recordPath);
      const firstStop = observer.stop();
      expect(observer.stop()).toBe(firstStop);
      await firstStop;
      await expect(observer.completion).resolves.toBeUndefined();
      await waitForProcessToExit(invocation.pid);
    } finally {
      await observer.stop();
      await rm(fake.directory, { recursive: true, force: true });
    }
  });

  it("O4 direct attach passes its request and config, forwards output and input, and resizes the terminal", async () => {
    const fake = await createFakeHerdr();
    const configPath = join(fake.directory, "direct-attach.toml");
    const output = outputRecorder();
    const attach = new HerdrPaneAttach(
      {
        executable: fake.executable,
        sessionId: "work-session",
        terminalId: "attach-input",
        columns: 91,
        rows: 29,
      },
      configPath,
      output.sink,
      logger,
    );

    try {
      const invocation = await waitForInvocation(fake.recordPath);
      expect(invocation.argv).toEqual([
        "--session",
        "work-session",
        "terminal",
        "attach",
        "attach-input",
        "--takeover",
      ]);
      expect(invocation.configPath).toBe(configPath);
      await vi.waitFor(() => expect(output.events.map(({ data }) => data).join("")).toContain("ATTACH_READY"), {
        timeout: 3_000,
        interval: 10,
      });

      attach.resize(120, 40);
      await vi.waitFor(() => expect(output.events.map(({ data }) => data).join("")).toContain("SIZE:120x40"), {
        timeout: 3_000,
        interval: 10,
      });

      attach.sendInput("adapter-input");
      await vi.waitFor(
        () => expect(output.events.map(({ data }) => data).join("")).toContain("RECEIVED:adapter-input"),
        { timeout: 3_000, interval: 10 },
      );
    } finally {
      await attach.stop();
      await rm(fake.directory, { recursive: true, force: true });
    }
  });

  it("O4 direct attach completion resolves when its default-Session process exits", async () => {
    const fake = await createFakeHerdr();
    const configPath = join(fake.directory, "direct-attach.toml");
    const output = outputRecorder();
    const attach = new HerdrPaneAttach(
      {
        executable: fake.executable,
        sessionId: "default",
        terminalId: "attach-exit",
        columns: 80,
        rows: 24,
      },
      configPath,
      output.sink,
      logger,
    );

    try {
      const invocation = await waitForInvocation(fake.recordPath);
      expect(invocation.argv).toEqual(["terminal", "attach", "attach-exit", "--takeover"]);
      expect(invocation.configPath).toBe(configPath);
      await attach.completion;
    } finally {
      await attach.stop();
      await rm(fake.directory, { recursive: true, force: true });
    }
  });

  it("O4 direct attach stop escalates for a stubborn process, is idempotent, and resolves completion", async () => {
    const fake = await createFakeHerdr();
    const configPath = join(fake.directory, "direct-attach.toml");
    const output = outputRecorder();
    const attach = new HerdrPaneAttach(
      {
        executable: fake.executable,
        sessionId: "default",
        terminalId: "attach-stubborn",
        columns: 80,
        rows: 24,
      },
      configPath,
      output.sink,
      logger,
    );

    try {
      const invocation = await waitForInvocation(fake.recordPath);
      const firstStop = attach.stop();
      expect(attach.stop()).toBe(firstStop);
      await firstStop;
      await expect(attach.completion).resolves.toBeUndefined();
      await waitForProcessToExit(invocation.pid);
    } finally {
      await attach.stop();
      await rm(fake.directory, { recursive: true, force: true });
    }
  });
});
