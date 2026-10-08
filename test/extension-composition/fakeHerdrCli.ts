#!/usr/bin/env node
import { createConnection } from "node:net";

const args = process.argv.slice(2);
const endpoint = process.env.HERDR_COMPOSITION_ENDPOINT;
if (endpoint === undefined) throw new Error("The composition fixture endpoint is not configured.");

const isSessionList = args[0] === "session" && args[1] === "list";
const isPluginList = args[0] === "plugin" && args[1] === "list";
const sessionOffset = args[0] === "--session" ? 2 : 0;
const command = args.slice(sessionOffset);
const isObserver = command[0] === "terminal" && command[1] === "session" && command[2] === "observe";
const isAttach = command[0] === "terminal" && command[1] === "attach";
const isPaneClient = isObserver || isAttach;
if (isSessionList) {
  console.log(
    JSON.stringify({
      sessions: [
        { name: "composition", default: true, running: true, socket_path: endpoint },
        { name: "alternate", default: false, running: false },
      ],
    }),
  );
} else if (isPluginList) {
  console.log(JSON.stringify({ plugins: [] }));
} else if (command[0] === "status") {
  console.log(JSON.stringify({ server: { running: true, socket: endpoint } }));
} else if (command[0] === "server") {
  // The test owns the fake server; this Session is already running.
} else if (isPaneClient) {
  const mode = isObserver ? "observe" : "attach";
  const terminalId = command[isObserver ? 3 : 2];
  const socket = createConnection(endpoint, () => {
    socket.write(`${JSON.stringify({ id: "client", method: "fixture.client", params: { mode, terminalId } })}\n`);
    if (isObserver) {
      console.log(JSON.stringify({ type: "subscription_started" }));
      console.log(
        JSON.stringify({ type: "terminal.frame", full: true, bytes: Buffer.from("Fake Herdr\r\n").toString("base64") }),
      );
    } else {
      process.stdout.write("Fake Herdr\r\n");
    }
  });
  process.stdin.resume();
  process.stdin.on("end", () => socket.end());
} else {
  throw new Error(`Unexpected fake Herdr CLI arguments: ${JSON.stringify(args)}`);
}
