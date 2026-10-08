import { createServer, type Socket } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function startFakeHerdr() {
  const directory = await mkdtemp(join(tmpdir(), "herdr-composition-"));
  const endpoint = join(directory, "session.sock");
  const sockets = new Set<Socket>();
  const subscriptions = new Set<Socket>();
  const clients: { mode: string; terminalId: string }[] = [];
  let moved = false;
  const pane = () => ({
    pane_id: moved ? "pane-moved" : "pane-original",
    terminal_id: "terminal-original",
    workspace_id: moved ? "space-destination" : "space-original",
    tab_id: moved ? "tab-destination" : "tab-original",
    focused: true,
    agent_status: "idle",
    revision: moved ? 2 : 1,
    label: moved ? "Moved Pane" : "Original Pane",
    terminal_title: moved ? "Moved Pane" : "Original Pane",
  });
  const snapshot = () => ({
    type: "session_snapshot",
    snapshot: {
      version: "0.9.1",
      protocol: 22,
      workspaces: ["original", "destination"].map((suffix, index) => ({
        workspace_id: `space-${suffix}`,
        number: index + 1,
        label: suffix === "original" ? "Original Space" : "Destination Space",
        focused: index === 0,
        pane_count: Number(moved === (suffix === "destination")),
        tab_count: 1,
        active_tab_id: `tab-${suffix}`,
        agent_status: "idle",
      })),
      tabs: ["original", "destination"].map((suffix) => ({
        tab_id: `tab-${suffix}`,
        workspace_id: `space-${suffix}`,
        number: 1,
        label: suffix === "original" ? "Original Tab" : "Destination Tab",
        focused: true,
        pane_count: Number(moved === (suffix === "destination")),
        agent_status: "idle",
      })),
      panes: [pane()],
      layouts: [],
      agents: [],
    },
  });

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
      subscriptions.delete(socket);
    });
    let remainder = "";
    socket.on("data", (chunk: Buffer) => {
      const lines = `${remainder}${chunk.toString("utf8")}`.split("\n");
      remainder = lines.pop() ?? "";
      lines.filter(Boolean).forEach((line) => {
        const request = JSON.parse(line) as {
          id: string;
          method: string;
          params?: { mode: string; terminalId: string };
        };
        let result: unknown;
        switch (request.method) {
          case "ping":
            result = {
              type: "pong",
              version: "0.9.1",
              protocol: 22,
              capabilities: { endpoint_protocol_generation: 1 },
            };
            break;
          case "events.subscribe":
            subscriptions.add(socket);
            result = { type: "subscription_started" };
            break;
          case "session.snapshot":
            result = snapshot();
            break;
          case "fixture.client":
            if (request.params !== undefined) clients.push(request.params);
            result = { type: "ok" };
            break;
          default:
            throw new Error(`Unexpected fake Herdr request: ${request.method}`);
        }
        socket.write(`${JSON.stringify({ id: request.id, result })}\n`);
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, resolve);
  });

  return {
    endpoint,
    clients,
    movePane() {
      moved = true;
      subscriptions.forEach((socket) => {
        socket.write(
          `${JSON.stringify({ event: "pane.moved", data: { previous_pane_id: "pane-original", pane: pane() } })}\n`,
        );
      });
    },
    async dispose() {
      sockets.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
      await rm(directory, { recursive: true, force: true });
    },
  };
}
