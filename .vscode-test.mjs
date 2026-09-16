import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "dist/test/extension/**/*.test.js",
  workspaceFolder: "./test/fixtures/workspace",
  version: "stable",
  mocha: {
    timeout: 20_000,
  },
});
