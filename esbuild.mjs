import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = fileURLToPath(new URL(".", import.meta.url));
const sourceRoot = resolve(root, "src");

const commonOptions = {
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  alias: {
    "@capabilities": resolve(sourceRoot, "capabilities"),
    "@features": resolve(sourceRoot, "features"),
    "@infrastructure": resolve(sourceRoot, "infrastructure"),
  },
};

await rm(resolve(root, "dist"), { recursive: true, force: true });

await esbuild.build({
  ...commonOptions,
  entryPoints: [resolve(root, "src/extension/activate.ts")],
  outfile: resolve(root, "dist/extension.js"),
});

for (const entryPoint of ["activation.test.ts", "sessions.test.ts", "terminal-surfaces.test.ts"]) {
  await esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(root, "test/extension", entryPoint)],
    outfile: resolve(root, "dist/test/extension", entryPoint.replace(/\.ts$/, ".js")),
  });
}
