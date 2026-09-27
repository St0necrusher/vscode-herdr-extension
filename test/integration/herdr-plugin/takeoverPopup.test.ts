import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Server, type Socket } from "node:net";
import * as esbuild from "esbuild";
import { spawn, type IPty } from "node-pty";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const PANE_ID = "pane-test26";
const TOKEN = "token-test26";
const HEARTBEAT_INTERVAL_MS = 800;
const SOCKET_EVENT_TIMEOUT_MS = 3_000;
const POPUP_EXIT_TIMEOUT_MS = 5_000;
const TEST_DIRECTORY_PREFIX = "herdr-takeover-popup-";
const POPUP_ENTRY_POINT = fileURLToPath(new URL("../../../herdr-plugin/takeoverPopup.ts", import.meta.url));

interface PopupProcess {
  readonly terminal: IPty;
  output: string;
  exitCode: number | undefined;
}

interface HerdrRequest {
  readonly id: string;
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
}

type ReadReply =
  | Readonly<{ result: Readonly<{ read: Readonly<{ text: string }> }> }>
  | Readonly<{ error: Readonly<{ code: string; message: string }> }>;

interface OwnerSocketServer {
  readonly server: Server;
  readonly connections: Socket[];
  readonly messages: string[];
  readonly sentMessages: string[];
  startHeartbeats(intervalMs?: number): void;
  stopHeartbeats(): void;
  send(message: string): void;
}

interface HerdrSocketServer {
  readonly server: Server;
  readonly connections: Socket[];
  readonly requests: HerdrRequest[];
}

interface PopupFixture {
  startOwner(events?: string[]): Promise<OwnerSocketServer>;
  startHerdr(readReply: (readIndex: number) => ReadReply, events?: string[]): Promise<HerdrSocketServer>;
  startPopup(): PopupProcess;
  cleanup(): Promise<void>;
}

let bundleDirectory: string;
let popupBundlePath: string;

beforeAll(async () => {
  bundleDirectory = await mkdtemp(join(tmpdir(), TEST_DIRECTORY_PREFIX));
  popupBundlePath = join(bundleDirectory, "takeover-popup.js");
  await esbuild.build({
    bundle: true,
    entryPoints: [POPUP_ENTRY_POINT],
    outfile: popupBundlePath,
    format: "cjs",
    platform: "node",
    target: "node20",
  });
}, 10_000);

afterAll(async () => {
  await rm(bundleDirectory, { recursive: true, force: true });
});

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeSocketServer(server: Server, connections: Socket[]): Promise<void> {
  connections.forEach((connection) => connection.destroy());
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function startOwnerSocketServer(socketPath: string, events: string[] = []): Promise<OwnerSocketServer> {
  const connections: Socket[] = [];
  const messages: string[] = [];
  const sentMessages: string[] = [];
  const server = createServer((connection) => {
    connections.push(connection);
    let remainder = "";
    connection.on("data", (chunk: Buffer) => {
      const lines = `${remainder}${chunk.toString("utf8")}`.split("\n");
      remainder = lines.pop() ?? "";
      lines.forEach((line) => {
        if (line.length > 0) {
          const message = line.trim();
          messages.push(message);
          events.push(`owner:${message}`);
        }
      });
    });
  });
  await listen(server, socketPath);

  let heartbeat: NodeJS.Timeout | undefined;
  return {
    server,
    connections,
    messages,
    sentMessages,
    startHeartbeats(intervalMs = HEARTBEAT_INTERVAL_MS) {
      heartbeat = setInterval(() => {
        connections
          .filter((connection) => !connection.destroyed)
          .forEach((connection) => {
            sentMessages.push("alive");
            connection.write("alive\n");
          });
      }, intervalMs);
    },
    stopHeartbeats() {
      clearInterval(heartbeat);
    },
    send(message) {
      connections
        .filter((connection) => !connection.destroyed)
        .forEach((connection) => {
          sentMessages.push(message);
          connection.write(`${message}\n`);
        });
    },
  };
}

async function startHerdrSocketServer(
  socketPath: string,
  readReply: (readIndex: number) => ReadReply,
  events: string[] = [],
): Promise<HerdrSocketServer> {
  const connections: Socket[] = [];
  const requests: HerdrRequest[] = [];
  let readCount = 0;
  const server = createServer((connection) => {
    connections.push(connection);
    let remainder = "";
    connection.on("data", (chunk: Buffer) => {
      const lines = `${remainder}${chunk.toString("utf8")}`.split("\n");
      remainder = lines.pop() ?? "";
      lines.forEach((line) => {
        if (line.length > 0) {
          const request = JSON.parse(line) as HerdrRequest;
          requests.push(request);
          events.push(`herdr:${request.method}`);
          if (request.method === "pane.read") {
            const readIndex = readCount;
            readCount += 1;
            connection.end(`${JSON.stringify({ id: request.id, ...readReply(readIndex) })}\n`);
          } else if (request.method === "pane.send_text") {
            connection.write(`${JSON.stringify({ id: request.id, result: {} })}\n`);
          }
        }
      });
    });
  });
  await listen(server, socketPath);
  return { server, connections, requests };
}

function startPopupProcess(ownerSocketPath: string, herdrSocketPath: string): PopupProcess {
  const terminal = spawn(process.execPath, [popupBundlePath], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      TERM: "xterm-256color",
      HERDR_VSCODE_TAKEOVER_SOCKET: ownerSocketPath,
      HERDR_VSCODE_TAKEOVER_TOKEN: TOKEN,
      HERDR_VSCODE_TAKEOVER_PANE: PANE_ID,
      HERDR_SOCKET_PATH: herdrSocketPath,
    },
  });
  const popup: PopupProcess = { terminal, output: "", exitCode: undefined };
  terminal.onData((data) => {
    popup.output += data;
  });
  terminal.onExit(({ exitCode }) => {
    popup.exitCode = exitCode;
  });
  return popup;
}

async function waitForOwnerMessage(owner: OwnerSocketServer, message: string): Promise<void> {
  await vi.waitFor(() => expect(owner.messages).toContain(message), {
    timeout: SOCKET_EVENT_TIMEOUT_MS,
    interval: 20,
  });
}

async function waitForOwnerAliveCount(
  owner: OwnerSocketServer,
  count: number,
  timeout = SOCKET_EVENT_TIMEOUT_MS,
): Promise<void> {
  await vi.waitFor(
    () => expect(owner.sentMessages.filter((message) => message === "alive").length).toBeGreaterThanOrEqual(count),
    { timeout, interval: 20 },
  );
}

async function waitForHerdrRequestCount(herdr: HerdrSocketServer, method: string, count: number): Promise<void> {
  await vi.waitFor(
    () => expect(herdr.requests.filter((request) => request.method === method).length).toBeGreaterThanOrEqual(count),
    { timeout: SOCKET_EVENT_TIMEOUT_MS, interval: 20 },
  );
}

async function waitForPopupOutput(popup: PopupProcess, text: string): Promise<void> {
  await vi.waitFor(() => expect(popup.output).toContain(text), {
    timeout: SOCKET_EVENT_TIMEOUT_MS,
    interval: 20,
  });
}

async function waitForPopupExit(popup: PopupProcess, timeout = POPUP_EXIT_TIMEOUT_MS): Promise<void> {
  await vi.waitFor(() => expect(popup.exitCode).toBeDefined(), { timeout, interval: 20 });
}

async function createPopupFixture(): Promise<PopupFixture> {
  const directory = await mkdtemp(join(tmpdir(), TEST_DIRECTORY_PREFIX));
  const ownerSocketPath = join(directory, "owner.sock");
  const herdrSocketPath = join(directory, "herdr.sock");
  let owner: OwnerSocketServer | undefined;
  let herdr: HerdrSocketServer | undefined;
  let popup: PopupProcess | undefined;

  return {
    async startOwner(events = []) {
      owner = await startOwnerSocketServer(ownerSocketPath, events);
      return owner;
    },
    async startHerdr(readReply, events = []) {
      herdr = await startHerdrSocketServer(herdrSocketPath, readReply, events);
      return herdr;
    },
    startPopup() {
      popup = startPopupProcess(ownerSocketPath, herdrSocketPath);
      return popup;
    },
    async cleanup() {
      if (popup !== undefined) {
        if (popup.exitCode === undefined) {
          popup.terminal.kill("SIGKILL");
          await waitForPopupExit(popup);
        }
      }
      if (owner !== undefined) {
        owner.stopHeartbeats();
        await closeSocketServer(owner.server, owner.connections);
      }
      if (herdr !== undefined) {
        await closeSocketServer(herdr.server, herdr.connections);
      }
      await rm(directory, { recursive: true, force: true });
    },
  };
}

describe("Herdr mobile takeover popup process", () => {
  it("C1 sends hello, requests a visible ANSI frame, and keeps mirroring after Herdr closes a read connection", async () => {
    const fixture = await createPopupFixture();
    try {
      const owner = await fixture.startOwner();
      owner.startHeartbeats();
      const herdr = await fixture.startHerdr((readIndex) => ({
        result: { read: { text: readIndex === 0 ? "FIRST_FRAME_VISIBLE" : "SECOND_FRAME_VISIBLE" } },
      }));
      const popup = fixture.startPopup();

      await waitForOwnerMessage(owner, `hello ${TOKEN}`);
      await waitForPopupOutput(popup, "FIRST_FRAME_VISIBLE");
      await waitForPopupOutput(popup, "SECOND_FRAME_VISIBLE");
      await waitForHerdrRequestCount(herdr, "pane.read", 2);
      await waitForOwnerAliveCount(owner, 2);

      const readRequests = herdr.requests.filter((request) => request.method === "pane.read");
      expect(readRequests[0]?.params).toEqual({ pane_id: PANE_ID, source: "visible", format: "ansi" });
      expect(readRequests[1]?.params).toEqual({ pane_id: PANE_ID, source: "visible", format: "ansi" });
      expect(popup.exitCode).toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  }, 10_000);

  it("C2 forwards a confirming key to the Pane before confirming and exiting", async () => {
    const fixture = await createPopupFixture();
    const events: string[] = [];
    try {
      const owner = await fixture.startOwner(events);
      owner.startHeartbeats();
      const herdr = await fixture.startHerdr(() => ({ result: { read: { text: "PANE_FRAME" } } }), events);
      const popup = fixture.startPopup();

      await waitForOwnerMessage(owner, `hello ${TOKEN}`);
      popup.terminal.write("k");
      await waitForHerdrRequestCount(herdr, "pane.send_text", 1);
      await waitForOwnerMessage(owner, "confirm");
      await waitForPopupExit(popup);

      const sendText = herdr.requests.find((request) => request.method === "pane.send_text");
      expect(sendText?.params).toEqual({ pane_id: PANE_ID, text: "k" });
      expect(events.indexOf("herdr:pane.send_text")).toBeLessThan(events.indexOf("owner:confirm"));
    } finally {
      await fixture.cleanup();
    }
  }, 10_000);

  it("C3 confirms and exits on a mouse press or wheel without forwarding either to the Pane", async () => {
    const verifyMouseConfirm = async (input: string): Promise<void> => {
      const fixture = await createPopupFixture();
      try {
        const owner = await fixture.startOwner();
        owner.startHeartbeats();
        const herdr = await fixture.startHerdr(() => ({ result: { read: { text: "PANE_FRAME" } } }));
        const popup = fixture.startPopup();

        await waitForOwnerMessage(owner, `hello ${TOKEN}`);
        popup.terminal.write(input);
        await waitForOwnerMessage(owner, "confirm");
        await waitForPopupExit(popup);
        expect(herdr.requests.filter((request) => request.method === "pane.send_text")).toHaveLength(0);
      } finally {
        await fixture.cleanup();
      }
    };

    await verifyMouseConfirm("\x1b[<0;3;3M");
    await verifyMouseConfirm("\x1b[<64;3;3M");
  }, 15_000);

  it("C4 keeps running without confirm for focus reports and a mouse release", async () => {
    const fixture = await createPopupFixture();
    try {
      const owner = await fixture.startOwner();
      owner.startHeartbeats(400);
      await fixture.startHerdr(() => ({ result: { read: { text: "PANE_FRAME" } } }));
      const popup = fixture.startPopup();

      await waitForOwnerMessage(owner, `hello ${TOKEN}`);
      await waitForOwnerAliveCount(owner, 1);
      popup.terminal.write("\x1b[I");
      await waitForOwnerAliveCount(owner, 2);
      expect(owner.messages).not.toContain("confirm");
      expect(popup.exitCode).toBeUndefined();

      popup.terminal.write("\x1b[O");
      await waitForOwnerAliveCount(owner, 3);
      expect(owner.messages).not.toContain("confirm");
      expect(popup.exitCode).toBeUndefined();

      popup.terminal.write("\x1b[<0;3;3m");
      await waitForOwnerAliveCount(owner, 4);
      expect(owner.messages).not.toContain("confirm");
      expect(popup.exitCode).toBeUndefined();

      owner.send("retract");
      await waitForPopupExit(popup);
    } finally {
      await fixture.cleanup();
    }
  }, 10_000);

  it("C5 exits on owner retract without confirming", async () => {
    const fixture = await createPopupFixture();
    try {
      const owner = await fixture.startOwner();
      await fixture.startHerdr(() => ({ result: { read: { text: "PANE_FRAME" } } }));
      const popup = fixture.startPopup();

      await waitForOwnerMessage(owner, `hello ${TOKEN}`);
      owner.send("retract");
      await waitForPopupExit(popup);
      expect(owner.messages).not.toContain("confirm");
    } finally {
      await fixture.cleanup();
    }
  });

  it("C5 exits when the owner closes the socket without confirming", async () => {
    const fixture = await createPopupFixture();
    try {
      const owner = await fixture.startOwner();
      await fixture.startHerdr(() => ({ result: { read: { text: "PANE_FRAME" } } }));
      const popup = fixture.startPopup();

      await waitForOwnerMessage(owner, `hello ${TOKEN}`);
      owner.connections[0]?.end();
      await waitForPopupExit(popup);
      expect(owner.messages).not.toContain("confirm");
    } finally {
      await fixture.cleanup();
    }
  });

  it("C5 exits without alive after three seconds and stays alive beyond three seconds with heartbeats", async () => {
    const silentFixture = await createPopupFixture();
    try {
      const silentOwner = await silentFixture.startOwner();
      await silentFixture.startHerdr(() => ({ result: { read: { text: "PANE_FRAME" } } }));
      const silentPopup = silentFixture.startPopup();

      await waitForOwnerMessage(silentOwner, `hello ${TOKEN}`);
      await waitForPopupExit(silentPopup, 4_000);
      expect(silentOwner.messages).not.toContain("confirm");
    } finally {
      await silentFixture.cleanup();
    }

    const liveFixture = await createPopupFixture();
    try {
      const liveOwner = await liveFixture.startOwner();
      liveOwner.startHeartbeats(750);
      await liveFixture.startHerdr(() => ({ result: { read: { text: "PANE_FRAME" } } }));
      const livePopup = liveFixture.startPopup();

      await waitForOwnerMessage(liveOwner, `hello ${TOKEN}`);
      await waitForOwnerAliveCount(liveOwner, 5, 5_000);
      expect(livePopup.exitCode).toBeUndefined();
      expect(liveOwner.messages).not.toContain("confirm");

      liveOwner.send("retract");
      await waitForPopupExit(livePopup);
      expect(liveOwner.messages).not.toContain("confirm");
    } finally {
      await liveFixture.cleanup();
    }
  }, 15_000);

  it("C5 exits when the owner socket path is unreachable", async () => {
    const fixture = await createPopupFixture();
    try {
      await fixture.startHerdr(() => ({ result: { read: { text: "PANE_FRAME" } } }));
      const popup = fixture.startPopup();
      await waitForPopupExit(popup, 4_000);
    } finally {
      await fixture.cleanup();
    }
  });

  it("C5 exits when the Herdr socket path is unreachable without confirming", async () => {
    const fixture = await createPopupFixture();
    try {
      const owner = await fixture.startOwner();
      const popup = fixture.startPopup();

      await waitForOwnerMessage(owner, `hello ${TOKEN}`);
      await waitForPopupExit(popup);
      expect(owner.messages).not.toContain("confirm");
    } finally {
      await fixture.cleanup();
    }
  });

  it("C5 exits when Herdr answers pane.read with an error without confirming", async () => {
    const fixture = await createPopupFixture();
    try {
      const owner = await fixture.startOwner();
      await fixture.startHerdr(() => ({ error: { code: "pane_unavailable", message: "Pane is unavailable" } }));
      const popup = fixture.startPopup();

      await waitForOwnerMessage(owner, `hello ${TOKEN}`);
      await waitForPopupExit(popup);
      expect(owner.messages).not.toContain("confirm");
    } finally {
      await fixture.cleanup();
    }
  });
});
