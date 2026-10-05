import { chmod, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HerdrLogger } from "../../../src/capabilities/runtime";
import type { HerdrConfigurationSource } from "../../../src/capabilities/sessions";
import { TakeoverPopupHost } from "../../../src/infrastructure/pane-editors/takeover/TakeoverPopupHost";
import { TAKEOVER_PLUGIN_ID } from "../../../src/infrastructure/pane-editors/takeover/TakeoverPluginRegistration";

vi.mock("vscode", () => ({}));

// The host's timings, mirrored from TakeoverPopupHost.
const HELLO_TIMEOUT_MS = 5_000;
const REOPEN_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;

type HerdrMode = "success" | "failure" | "plugin-not-found";
type FakeInvocation = Readonly<{ argv: string[] }>;
type FakeHerdr = Readonly<{
  directory: string;
  executable: string;
  invocations(): Promise<FakeInvocation[]>;
}>;

afterEach(() => {
  vi.useRealTimers();
});

class PopupConnection {
  readonly lines: string[] = [];
  readonly closed: Promise<void>;
  private remainder = "";

  constructor(readonly socket: Socket) {
    this.closed = new Promise((resolve) => socket.once("close", resolve));
    socket.on("data", (chunk: Buffer) => {
      const lines = `${this.remainder}${chunk.toString("utf8")}`.split("\n");
      this.remainder = lines.pop() ?? "";
      lines.forEach((line) => {
        if (line.length > 0) this.lines.push(line);
      });
    });
    socket.on("error", () => undefined);
  }
}

async function createFakeHerdr(mode: HerdrMode): Promise<FakeHerdr> {
  const directory = await mkdtemp(join(tmpdir(), "herdr-takeover-host-"));
  const executable = join(directory, "herdr");
  const recordPath = join(directory, "invocations.jsonl");
  const source = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const recordPath = ${JSON.stringify(recordPath)};
const mode = ${JSON.stringify(mode)};
fs.appendFileSync(recordPath, JSON.stringify({ argv: args }) + "\\n");
if (mode === "failure") {
  process.stderr.write("fake herdr open failed");
  process.exitCode = 23;
} else if (mode === "plugin-not-found") {
  process.stdout.write('{"error":{"code":"plugin_not_found","message":"missing"}}');
  process.exitCode = 23;
}
`;

  await writeFile(recordPath, "", "utf8");
  await writeFile(executable, source, "utf8");
  await chmod(executable, 0o755);

  return {
    directory,
    executable,
    async invocations() {
      const records = await readFile(recordPath, "utf8");
      if (records.length === 0) return [];
      return records
        .trimEnd()
        .split("\n")
        .map((record) => JSON.parse(record) as FakeInvocation);
    },
  };
}

async function createFixture(mode: HerdrMode = "success", isRegistered = true) {
  const fake = await createFakeHerdr(mode);
  const configuration: HerdrConfigurationSource = {
    read: () => ({ executable: fake.executable, session: "default" }),
    onDidChange: () => ({ dispose: () => undefined }),
  };
  const registration = { isRegistered: () => isRegistered };
  const info = vi.fn();
  const error = vi.fn();
  const logger: HerdrLogger = {
    info,
    error,
    show: vi.fn(),
  };
  const host = new TakeoverPopupHost(configuration, registration, logger);
  const popups: PopupConnection[] = [];

  return {
    fake,
    host,
    info,
    error,
    async connect(invocation: FakeInvocation): Promise<PopupConnection> {
      const socketPath = requiredEnvironment(invocation, "HERDR_VSCODE_TAKEOVER_SOCKET");
      const popup = new PopupConnection(createConnection(socketPath));
      popups.push(popup);
      await new Promise<void>((resolve, reject) => {
        popup.socket.once("connect", resolve);
        popup.socket.once("error", reject);
      });
      return popup;
    },
    async cleanup(): Promise<void> {
      host.dispose();
      popups.forEach(({ socket }) => socket.destroy());
      await Promise.all(popups.map(({ closed }) => closed));
      await rm(fake.directory, { recursive: true, force: true });
    },
  };
}

function requiredEnvironment(invocation: FakeInvocation, name: string): string {
  const prefix = `${name}=`;
  const assignment = invocation.argv.find((argument) => argument.startsWith(prefix));
  if (assignment === undefined) throw new Error(`Missing ${name} from fake Herdr argv`);
  return assignment.slice(prefix.length);
}

// Waits in real time: the fake Herdr is a real process, and advancing fake time while it starts can pass
// the hello deadline and trigger an extra open. Tests advance fake time only once the host waits on a timer.
async function waitForOpenCount(fake: FakeHerdr, count: number): Promise<FakeInvocation[]> {
  await vi.waitFor(async () => expect((await fake.invocations()).length).toBeGreaterThanOrEqual(count), {
    timeout: 5_000,
    interval: 10,
  });
  return fake.invocations();
}

async function waitForFailedOpenCount(error: ReturnType<typeof vi.fn>, count: number): Promise<void> {
  await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(count), { timeout: 5_000, interval: 10 });
}

async function getInvocation(fake: FakeHerdr, index: number): Promise<FakeInvocation> {
  const invocations = await waitForOpenCount(fake, index + 1);
  const invocation = invocations[index];
  if (invocation === undefined) throw new Error(`Missing fake Herdr invocation ${index + 1}`);
  return invocation;
}

describe("TakeoverPopupHost adapter", () => {
  it("B1 opens the takeover popup with its Session and Pane, heartbeats, and confirms exactly once", async () => {
    const fixture = await createFixture();
    let confirmations = 0;
    const offer = fixture.host.offer({
      sessionId: "work-session",
      paneId: "pane-17",
      onConfirm: () => {
        confirmations += 1;
      },
    });

    try {
      const invocation = await getInvocation(fixture.fake, 0);
      const socketPath = requiredEnvironment(invocation, "HERDR_VSCODE_TAKEOVER_SOCKET");
      const token = requiredEnvironment(invocation, "HERDR_VSCODE_TAKEOVER_TOKEN");
      expect(invocation.argv).toEqual([
        "--session",
        "work-session",
        "plugin",
        "pane",
        "open",
        "--plugin",
        TAKEOVER_PLUGIN_ID,
        "--entrypoint",
        "takeover",
        "--env",
        `HERDR_VSCODE_TAKEOVER_SOCKET=${socketPath}`,
        "--env",
        `HERDR_VSCODE_TAKEOVER_TOKEN=${token}`,
        "--env",
        "HERDR_VSCODE_TAKEOVER_PANE=pane-17",
      ]);

      const popup = await fixture.connect(invocation);
      popup.socket.write(`hello ${token}\n`);
      await vi.waitFor(() => expect(popup.lines.filter((line) => line === "alive")).toHaveLength(2), {
        timeout: 3_000,
        interval: 50,
      });
      popup.socket.write("confirm\nconfirm\n");
      await popup.closed;
      expect(confirmations).toBe(1);
      offer.retract();
      expect(confirmations).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("B1 omits --session when opening a popup for the default Session", async () => {
    const fixture = await createFixture();
    const offer = fixture.host.offer({ sessionId: "default", paneId: "pane-default", onConfirm: () => undefined });

    try {
      const invocation = await getInvocation(fixture.fake, 0);
      const socketPath = requiredEnvironment(invocation, "HERDR_VSCODE_TAKEOVER_SOCKET");
      const token = requiredEnvironment(invocation, "HERDR_VSCODE_TAKEOVER_TOKEN");
      expect(invocation.argv).toEqual([
        "plugin",
        "pane",
        "open",
        "--plugin",
        TAKEOVER_PLUGIN_ID,
        "--entrypoint",
        "takeover",
        "--env",
        `HERDR_VSCODE_TAKEOVER_SOCKET=${socketPath}`,
        "--env",
        `HERDR_VSCODE_TAKEOVER_TOKEN=${token}`,
        "--env",
        "HERDR_VSCODE_TAKEOVER_PANE=pane-default",
      ]);
      offer.retract();
    } finally {
      await fixture.cleanup();
    }
  });

  it("B2 rejects foreign and stale tokens and confirm before hello", async () => {
    const fixture = await createFixture();
    let staleConfirmations = 0;
    let currentConfirmations = 0;
    const staleOffer = fixture.host.offer({
      sessionId: "default",
      paneId: "stale-pane",
      onConfirm: () => {
        staleConfirmations += 1;
      },
    });

    try {
      const staleInvocation = await getInvocation(fixture.fake, 0);
      const staleToken = requiredEnvironment(staleInvocation, "HERDR_VSCODE_TAKEOVER_TOKEN");
      staleOffer.retract();
      const currentOffer = fixture.host.offer({
        sessionId: "default",
        paneId: "current-pane",
        onConfirm: () => {
          currentConfirmations += 1;
        },
      });
      const currentInvocation = await getInvocation(fixture.fake, 1);
      const currentToken = requiredEnvironment(currentInvocation, "HERDR_VSCODE_TAKEOVER_TOKEN");

      const foreignPopup = await fixture.connect(currentInvocation);
      foreignPopup.socket.write("hello foreign-token\n");
      await vi.waitFor(() => expect(foreignPopup.lines).toContain("retract"));
      await foreignPopup.closed;

      const prematurePopup = await fixture.connect(currentInvocation);
      prematurePopup.socket.write("confirm\n");
      await prematurePopup.closed;
      expect(currentConfirmations).toBe(0);

      const stalePopup = await fixture.connect(currentInvocation);
      stalePopup.socket.write(`hello ${staleToken}\n`);
      await vi.waitFor(() => expect(stalePopup.lines).toContain("retract"));
      await stalePopup.closed;
      expect(staleConfirmations).toBe(0);

      const acceptedPopup = await fixture.connect(currentInvocation);
      acceptedPopup.socket.write(`hello ${currentToken}\nconfirm\n`);
      await acceptedPopup.closed;
      expect(currentConfirmations).toBe(1);
      currentOffer.retract();
    } finally {
      await fixture.cleanup();
    }
  });

  it("B3 retracts the shown popup when replaced and when its offer is retracted", async () => {
    const fixture = await createFixture();
    let firstConfirmations = 0;
    let secondConfirmations = 0;
    fixture.host.offer({
      sessionId: "default",
      paneId: "first-pane",
      onConfirm: () => {
        firstConfirmations += 1;
      },
    });

    try {
      const firstInvocation = await getInvocation(fixture.fake, 0);
      const firstPopup = await fixture.connect(firstInvocation);
      firstPopup.socket.write(`hello ${requiredEnvironment(firstInvocation, "HERDR_VSCODE_TAKEOVER_TOKEN")}\n`);
      await vi.waitFor(() => expect(firstPopup.lines).toContain("alive"), { timeout: 3_000, interval: 50 });

      const secondOffer = fixture.host.offer({
        sessionId: "default",
        paneId: "second-pane",
        onConfirm: () => {
          secondConfirmations += 1;
        },
      });
      await vi.waitFor(() => expect(firstPopup.lines).toContain("retract"));
      await firstPopup.closed;
      expect(firstConfirmations).toBe(0);

      const secondInvocation = await getInvocation(fixture.fake, 1);
      const secondPopup = await fixture.connect(secondInvocation);
      secondPopup.socket.write(`hello ${requiredEnvironment(secondInvocation, "HERDR_VSCODE_TAKEOVER_TOKEN")}\n`);
      await vi.waitFor(() => expect(secondPopup.lines).toContain("alive"), { timeout: 3_000, interval: 50 });
      secondOffer.retract();
      await vi.waitFor(() => expect(secondPopup.lines).toContain("retract"));
      await secondPopup.closed;
      expect(secondConfirmations).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it("B4 bounds retries after CLI failures to five opens", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const fixture = await createFixture("failure");
    fixture.host.offer({ sessionId: "default", paneId: "failure-pane", onConfirm: () => undefined });

    try {
      for (const [index, reopenDelay] of REOPEN_DELAYS_MS.entries()) {
        await waitForFailedOpenCount(fixture.error, index + 1);
        await vi.advanceTimersByTimeAsync(reopenDelay);
      }
      await waitForFailedOpenCount(fixture.error, 5);
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await fixture.fake.invocations()).length).toBe(5);
    } finally {
      await fixture.cleanup();
    }
  });

  it("B4 does not reset the retry budget when each popup says hello then closes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const fixture = await createFixture();
    fixture.host.offer({ sessionId: "default", paneId: "closing-popup-pane", onConfirm: () => undefined });

    try {
      const firstInvocation = await getInvocation(fixture.fake, 0);
      const token = requiredEnvironment(firstInvocation, "HERDR_VSCODE_TAKEOVER_TOKEN");
      for (const index of [0, 1, 2, 3, 4]) {
        const invocation = await getInvocation(fixture.fake, index);
        const popup = await fixture.connect(invocation);
        popup.socket.write(`hello ${token}\n`);
        popup.socket.end();
        await popup.closed;
        await waitForFailedOpenCount(fixture.error, index + 1);
        await vi.advanceTimersByTimeAsync(REOPEN_DELAYS_MS[index] ?? 0);
      }

      await vi.advanceTimersByTimeAsync(30_000);
      expect((await fixture.fake.invocations()).length).toBe(5);
    } finally {
      await fixture.cleanup();
    }
  });

  it("B4 reopens after a popup misses the hello deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const fixture = await createFixture();
    const offer = fixture.host.offer({ sessionId: "default", paneId: "silent-popup-pane", onConfirm: () => undefined });

    try {
      await waitForOpenCount(fixture.fake, 1);
      await vi.advanceTimersByTimeAsync(HELLO_TIMEOUT_MS + REOPEN_DELAYS_MS[0]);
      await waitForOpenCount(fixture.fake, 2);
      expect((await fixture.fake.invocations()).length).toBe(2);
      offer.retract();
    } finally {
      await fixture.cleanup();
    }
  });

  it("B4 does not reopen after the offer is retracted", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const fixture = await createFixture();
    const offer = fixture.host.offer({ sessionId: "default", paneId: "retracted-pane", onConfirm: () => undefined });

    try {
      await waitForOpenCount(fixture.fake, 1);
      offer.retract();
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await fixture.fake.invocations()).length).toBe(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("B5 stops opening after plugin_not_found and launches nothing when unregistered", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const missingFixture = await createFixture("plugin-not-found");
    missingFixture.host.offer({ sessionId: "default", paneId: "missing-plugin-pane", onConfirm: () => undefined });

    try {
      await waitForOpenCount(missingFixture.fake, 1);
      await vi.waitFor(() => expect(missingFixture.info).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(20_000);
      expect((await missingFixture.fake.invocations()).length).toBe(1);
    } finally {
      await missingFixture.cleanup();
    }

    const unregisteredFixture = await createFixture("success", false);
    try {
      unregisteredFixture.host.offer({
        sessionId: "default",
        paneId: "unregistered-plugin-pane",
        onConfirm: () => undefined,
      });
      expect(await unregisteredFixture.fake.invocations()).toEqual([]);
    } finally {
      await unregisteredFixture.cleanup();
    }
  });

  it("B6 dispose retracts a shown popup and removes its owner socket file", async () => {
    const fixture = await createFixture();
    let confirmations = 0;
    fixture.host.offer({
      sessionId: "default",
      paneId: "dispose-pane",
      onConfirm: () => {
        confirmations += 1;
      },
    });

    try {
      const invocation = await getInvocation(fixture.fake, 0);
      const socketPath = requiredEnvironment(invocation, "HERDR_VSCODE_TAKEOVER_SOCKET");
      const popup = await fixture.connect(invocation);
      popup.socket.write(`hello ${requiredEnvironment(invocation, "HERDR_VSCODE_TAKEOVER_TOKEN")}\n`);
      await vi.waitFor(() => expect(popup.lines).toContain("alive"), { timeout: 3_000, interval: 50 });

      fixture.host.dispose();
      await vi.waitFor(() => expect(popup.lines).toContain("retract"), { timeout: 3_000, interval: 50 });
      await popup.closed;
      await expect(lstat(socketPath)).rejects.toMatchObject({ code: "ENOENT" });
      expect(confirmations).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });
});
