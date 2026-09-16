import { relative, sep } from "node:path";

export function findImports(text) {
  const matches = text.matchAll(
    /(?:import|export)\s+(type\s+)?(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g,
  );
  return [...matches].map((match) => ({
    specifier: match[2],
    typeOnly: match[1] !== undefined,
  }));
}

export function checkArchitectureEdge(root, source, target, typeOnly) {
  const from = parts(root, source);
  const to = parts(root, target);
  const violations = [];
  if (to[0] !== "src") return violations;

  const fromLayer = from[1];
  const toLayer = to[1];
  if (fromLayer === "features" && ["adapters", "extension"].includes(toLayer)) {
    violations.push("features may not depend on adapters or extension");
  }
  if (fromLayer === "adapters" && toLayer === "extension") {
    violations.push("adapters may not depend on extension");
  }
  if (fromLayer === "adapters" && toLayer === "features" && !typeOnly) {
    violations.push(
      "adapters may import feature public interfaces only as types",
    );
  }
  if (fromLayer === "features" && toLayer === "features" && from[2] !== to[2]) {
    violations.push("sibling features must remain isolated");
  }
  if (
    fromLayer === "adapters" &&
    toLayer === "adapters" &&
    `${from[2]}/${from[3]}` !== `${to[2]}/${to[3]}`
  ) {
    violations.push("sibling adapters must remain isolated");
  }

  if (moduleName(from) !== moduleName(to) && to.includes("internal")) {
    violations.push("cross-module imports must use the public entry point");
  }
  return violations;
}

function moduleName(pathParts) {
  if (pathParts[1] === "features") return `features/${pathParts[2]}`;
  if (pathParts[1] === "adapters")
    return `adapters/${pathParts[2]}/${pathParts[3]}`;
  return pathParts[1];
}

function parts(root, path) {
  return relative(root, path).split(sep);
}
