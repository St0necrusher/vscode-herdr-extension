import { readdir, readFile } from "node:fs/promises";
import {
  dirname,
  extname,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import { checkArchitectureEdge, findImports } from "./architecture-rules.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "src");
const violations = [];

for (const source of await walk(sourceRoot)) {
  const text = await readFile(source, "utf8");
  for (const imported of findImports(text)) {
    if (imported.specifier?.startsWith(".") !== true) continue;
    const target = resolveImport(source, imported.specifier);
    for (const reason of checkArchitectureEdge(
      root,
      source,
      target,
      imported.typeOnly,
    )) {
      violations.push(
        `${relative(root, source)} -> ${relative(root, target)}: ${reason}`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error(
    "Architecture violations:\n" +
      violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log("Architecture boundaries: valid");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile() && extname(entry.name) === ".ts") files.push(path);
  }
  return files;
}

function resolveImport(source, specifier) {
  const resolved = normalize(resolve(dirname(source), specifier));
  return resolved.replace(/\.js$/, ".ts");
}
