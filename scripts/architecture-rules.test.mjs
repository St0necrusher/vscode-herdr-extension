import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { checkArchitectureEdge, findImports } from "./architecture-rules.mjs";

const root = "/repo";
const adapter = resolve(
  root,
  "src/adapters/herdr/lifecycle/internal/adapter.ts",
);
const featureEntry = resolve(root, "src/features/lifecycle/index.ts");

test("allows an adapter to import a feature public interface as types", () => {
  assert.deepEqual(
    checkArchitectureEdge(root, adapter, featureEntry, true),
    [],
  );
});

test("rejects an adapter runtime dependency on a feature", () => {
  assert.deepEqual(checkArchitectureEdge(root, adapter, featureEntry, false), [
    "adapters may import feature public interfaces only as types",
  ]);
});

test("recognizes type-only and runtime imports", () => {
  assert.deepEqual(
    findImports(`
      import type { Port } from "../../../features/lifecycle/index.js";
      import { createFeature } from "../../../features/lifecycle/index.js";
    `),
    [
      {
        specifier: "../../../features/lifecycle/index.js",
        typeOnly: true,
      },
      {
        specifier: "../../../features/lifecycle/index.js",
        typeOnly: false,
      },
    ],
  );
});
