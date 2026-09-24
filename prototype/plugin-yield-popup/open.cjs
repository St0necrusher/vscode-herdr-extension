"use strict";
// THROWAWAY: invoke a no-op popup through Herdr's official plugin interface.
const { spawnSync } = require("node:child_process");
const result = spawnSync(
  process.env.HERDR_BIN_PATH || "herdr",
  [
    "plugin",
    "pane",
    "open",
    "--plugin",
    "local.vscode-yield-popup-probe",
    "--entrypoint",
    "confirm",
  ],
  { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 10_000 },
);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) process.stderr.write(`${result.error.message}\n`);
process.exit(result.status ?? 1);
