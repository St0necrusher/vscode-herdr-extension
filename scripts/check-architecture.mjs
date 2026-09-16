import { readdir, readFile } from "node:fs/promises";
import {
  dirname,
  extname,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "src");
const violations = [];

for (const source of await walk(sourceRoot)) {
  const text = await readFile(source, "utf8");
  const imports = text.matchAll(
    /(?:import|export)\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
  );
  for (const match of imports) {
    const specifier = match[1];
    if (specifier?.startsWith(".") !== true) continue;
    const target = resolveImport(source, specifier);
    checkEdge(source, target);
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

function checkEdge(source, target) {
  const from = parts(source);
  const to = parts(target);
  if (to[0] !== "src") return;

  const fromLayer = from[1];
  const toLayer = to[1];
  if (fromLayer === "features" && ["adapters", "extension"].includes(toLayer)) {
    report(source, target, "features may not depend on adapters or extension");
  }
  if (fromLayer === "adapters" && toLayer === "extension") {
    report(source, target, "adapters may not depend on extension");
  }
  if (fromLayer === "features" && toLayer === "features" && from[2] !== to[2]) {
    report(source, target, "sibling features must remain isolated");
  }
  if (
    fromLayer === "adapters" &&
    toLayer === "adapters" &&
    `${from[2]}/${from[3]}` !== `${to[2]}/${to[3]}`
  ) {
    report(source, target, "sibling adapters must remain isolated");
  }

  const crossModule = moduleName(from) !== moduleName(to);
  if (crossModule && to.includes("internal")) {
    report(
      source,
      target,
      "cross-module imports must use the public entry point",
    );
  }
}

function moduleName(pathParts) {
  if (pathParts[1] === "features") return `features/${pathParts[2]}`;
  if (pathParts[1] === "adapters")
    return `adapters/${pathParts[2]}/${pathParts[3]}`;
  return pathParts[1];
}

function parts(path) {
  return relative(root, path).split(sep);
}

function report(source, target, reason) {
  violations.push(
    `${relative(root, source)} -> ${relative(root, target)}: ${reason}`,
  );
}
