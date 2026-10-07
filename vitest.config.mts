import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "src");

export default defineConfig({
  resolve: {
    alias: {
      "@core": resolve(sourceRoot, "core"),
      "@api": resolve(sourceRoot, "api"),
      "@modules": resolve(sourceRoot, "modules"),
      "@views": resolve(sourceRoot, "views"),
      "@features": resolve(sourceRoot, "features"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "test/integration/**/*.test.ts"],
    environment: "node",
    coverage: { reporter: ["text", "html"] },
  },
});
