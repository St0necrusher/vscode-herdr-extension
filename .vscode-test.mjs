import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "dist/test/extension/**/*.test.js",
  workspaceFolder: "./test/fixtures/workspace",
  version: "stable",
  // Under xvfb the window renders in software; any unresponsive moment kills a CLI test run.
  launchArgs: ["--disable-gpu"],
  mocha: {
    timeout: 20_000,
  },
});
