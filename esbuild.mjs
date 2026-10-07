import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  // jsonc-parser's UMD entry hides its internal requires from esbuild; bundle its ESM entry instead.
  mainFields: ["module", "main"],
  external: ["vscode", "node-pty"],
  sourcemap: true,
  alias: {
    "@core": resolve(sourceRoot, "core"),
    "@api": resolve(sourceRoot, "api"),
    "@modules": resolve(sourceRoot, "modules"),
    "@views": resolve(sourceRoot, "views"),
    "@features": resolve(sourceRoot, "features"),
  },
};

await rm(resolve(root, "dist"), { recursive: true, force: true });

await esbuild.build({
  ...commonOptions,
  entryPoints: [resolve(root, "src/extension/activate.ts")],
  outfile: resolve(root, "dist/extension.js"),
});

for (const entryPoint of [
  "activation.test.ts",
  "sessions.test.ts",
  "pane-command.test.ts",
  "pane-editors.test.ts",
  "agents-navigation.test.ts",
  "creation-commands.test.ts",
  "management-commands.test.ts",
  "run-npm-script.test.ts",
]) {
  await esbuild.build({
    ...commonOptions,
    entryPoints: [resolve(root, "test/extension", entryPoint)],
    outfile: resolve(root, "dist/test/extension", entryPoint.replace(/\.ts$/, ".js")),
  });
}

await esbuild.build({
  ...commonOptions,
  entryPoints: [resolve(root, "test/extension-fresh-window/first-pane-editor-focus.test.ts")],
  outfile: resolve(root, "dist/test/extension-fresh-window/first-pane-editor-focus.test.js"),
});

await esbuild.build({
  ...commonOptions,
  entryPoints: [resolve(root, "test/extension-composition/composition.test.ts")],
  outfile: resolve(root, "dist/test/extension-composition/composition.test.js"),
});

const fakeHerdrExecutable = resolve(root, "dist/test/extension-composition/fake-herdr.js");
await esbuild.build({
  ...commonOptions,
  entryPoints: [resolve(root, "test/extension-composition/fake-herdr.ts")],
  outfile: fakeHerdrExecutable,
});
await chmod(fakeHerdrExecutable, 0o755);
const compositionSettingsDirectory = resolve(root, "test/fixtures/composition-workspace/.vscode");
await mkdir(compositionSettingsDirectory, { recursive: true });
await writeFile(
  resolve(compositionSettingsDirectory, "settings.json"),
  JSON.stringify({ "herdr.executable": fakeHerdrExecutable, "herdr.session": "composition" }, null, 2) + "\n",
);

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
