import { readFile, rm, writeFile } from "node:fs/promises";
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
  external: ["vscode", "node-pty"],
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

for (const entryPoint of ["activation.test.ts", "sessions.test.ts", "pane-command.test.ts", "pane-editors.test.ts"]) {
  await esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(root, "test/extension", entryPoint)],
    outfile: resolve(root, "dist/test/extension", entryPoint.replace(/\.ts$/, ".js")),
  });
}

await esbuild.build({
  bundle: true,
  entryPoints: [resolve(root, "herdr-plugin/takeoverPopup.ts")],
  outfile: resolve(root, "dist/herdr-plugin/takeover-popup.js"),
  format: "cjs",
  platform: "node",
  target: "node20",
});

const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const manifestSource = await readFile(resolve(root, "herdr-plugin/herdr-plugin.toml"), "utf8");
const pluginManifest = manifestSource.replace('"__PACKAGE_VERSION__"', `"${packageJson.version}"`);
await writeFile(resolve(root, "dist/herdr-plugin/herdr-plugin.toml"), pluginManifest);
