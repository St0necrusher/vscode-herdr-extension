"use strict";
// THROWAWAY: popup button requests that VS Code release only its owned attach.
const { createConnection } = require("node:net");

const socketPath = process.env.HERDR_VSCODE_POPUP_SOCKET;
process.stdout.write(
  "\x1b[2J\x1b[H\r\n  TEMPORARY YIELD POPUP PROBE\r\n\r\n" +
    (socketPath
      ? "  Press y to ask VS Code to Yield, or q to dismiss.\r\n"
      : "  Manual probe: y cannot Yield; press q to dismiss.\r\n") +
    (socketPath
      ? "  Closes when VS Code stops offering control.\r\n"
      : "  Auto-closes after 3 minutes.\r\n"),
);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.resume();

let socket;
let requested = false;
if (socketPath) {
  socket = createConnection(socketPath);
  let lastPulse = Date.now();
  let response = "";
  let acknowledged = false;
  socket.on("data", (data) => {
    response += data.toString("utf8");
    if (response.length > 256) process.exit(0);
    while (response.includes("\n")) {
      const newline = response.indexOf("\n");
      const message = response.slice(0, newline);
      response = response.slice(newline + 1);
      if (message === "alive") lastPulse = Date.now();
      if (message === "accepted" && requested && !acknowledged) {
        acknowledged = true;
        process.stdout.write("\r\n  VS Code accepted Yield; closing...\r\n");
      }
    }
  });
  socket.on("error", () => process.exit(0));
  socket.on("close", () => process.exit(0));
  const watchdog = setInterval(() => {
    if (Date.now() - lastPulse > 4000) process.exit(0);
  }, 500);
  watchdog.unref();
} else {
  setTimeout(() => process.exit(0), 180_000);
}

process.stdin.on("data", (bytes) => {
  const value = bytes.toString("utf8").toLowerCase();
  if (value.includes("y") && !requested) {
    requested = true;
    if (socket) {
      process.stdout.write("\r\n  Requesting Yield from VS Code...\r\n");
      socket.write("confirm\n");
      setTimeout(() => {
        if (!acknowledged) {
          process.stdout.write(
            "\r\n  No VS Code acknowledgment; Yield unconfirmed.\r\n",
          );
        }
        process.exit(0);
      }, 3000);
    } else {
      process.stdout.write("\r\n  Manual probe: NO YIELD.\r\n");
      setTimeout(() => process.exit(0), 3000);
    }
  } else if (
    value.includes("q") ||
    value.includes("\x1b") ||
    value.includes("\x03")
  ) {
    process.exit(0);
  }
});
