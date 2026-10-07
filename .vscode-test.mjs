import { defineConfig } from "@vscode/test-cli";

const shared = {
  workspaceFolder: "./test/fixtures/workspace",
  version: "stable",
  // Under xvfb the window renders in software; any unresponsive moment kills a CLI test run.
  launchArgs: ["--disable-gpu"],
  mocha: {
    timeout: 20_000,
  },
};

export default defineConfig([
  { label: "extension", files: "dist/test/extension/**/*.test.js", ...shared },
  // Each file here gets a window of its own, for behavior that only a fresh window shows.
  { label: "fresh-window", files: "dist/test/extension-fresh-window/**/*.test.js", ...shared },
  {
    ...shared,
    label: "composition",
    files: "dist/test/extension-composition/**/*.test.js",
    workspaceFolder: "./test/fixtures/composition-workspace",
  },
]);
