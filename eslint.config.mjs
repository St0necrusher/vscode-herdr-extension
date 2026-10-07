import eslint from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-config-prettier";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

const element = (type, pattern, capture) => ({
  type,
  pattern,
  capture,
  partialMatch: false,
});

const layers = ["core", "api", "modules", "features", "views"];
const layerImports = {
  core: ["core"],
  api: ["core", "api"],
  modules: ["core", "api"],
  features: ["core", "api", "modules"],
  views: ["core", "api", "modules", "features"],
};
const layerType = (layer) => `layer-${layer}`;
const layerElements = layers.flatMap((layer) => [
  // Describe every directory recursively; source paths express directions within the captured block.
  element(layerType(layer), `src/${layer}/*/**/*`, ["block", "ancestors", "part"]),
  element(layerType(layer), `src/${layer}/*`, ["block"]),
]);
const layerPolicies = layers.flatMap((layer) => {
  const type = layerType(layer);
  const sameBlock = { type, captured: { block: "{{ from.element.captured.block }}" } };
  return [
    {
      from: { element: { type } },
      allow: {
        to: {
          element: { type: layerImports[layer].map(layerType) },
          file: { path: "src/*/*/index.ts" },
        },
      },
    },
    // These override the cross-block policy within a block: only flat files, direct children, and ancestor shared.
    {
      from: { element: { type } },
      disallow: { to: { element: sameBlock } },
    },
    {
      from: { element: { type } },
      allow: [
        {
          to: { element: sameBlock },
          dependency: { relationship: { from: "internal" }, source: "[.]/*" },
        },
        {
          to: { element: sameBlock, file: { path: "**/index.ts" } },
          dependency: { source: "[.]/{*,*/index,*/index.ts}" },
        },
        {
          to: { element: { ...sameBlock, captured: { ...sameBlock.captured, part: "shared" } } },
          dependency: { source: "+([.][.]/)shared{,/*}" },
        },
        {
          to: { element: sameBlock, file: { path: "**/index.ts" } },
          dependency: { source: "+([.][.]/)shared/{*,*/index,*/index.ts}" },
        },
      ],
    },
    {
      disallow: { to: { element: { type }, file: { path: "src/*/*/index.ts" } } },
      dependency: { source: `!@${layer}/*` },
      message: `Cross-block ${layer} imports must use @${layer} and the public index.ts.`,
    },
    {
      from: { element: { type } },
      allow: {
        to: { element: sameBlock },
        dependency: { relationship: { from: "internal" }, source: "[.]/*" },
      },
    },
  ];
});

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", ".vscode-test/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: {
      boundaries,
      "import-x": importX,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
      "import-x/resolver-next": [createTypeScriptImportResolver({ project: "./tsconfig.json" })],
      "import-x/extensions": [".ts", ".tsx", ".cts", ".mts", ".js", ".jsx", ".cjs", ".mjs"],
      "import-x/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx", ".cts", ".mts"],
      },
      "boundaries/elements": [
        ...layerElements,
        element("extension", "src/extension"),
        element("herdr-plugin", "herdr-plugin"),
        element("extension-test", "test/extension"),
        element("extension-test", "test/extension-fresh-window"),
        element("extension-test", "test/extension-composition"),
        element("integration-test", "test/integration"),
      ],
    },
    rules: {
      ...boundaries.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "import-x/no-cycle": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "PrivateIdentifier",
          message: "Use the TypeScript private modifier instead of JavaScript # private identifiers.",
        },
      ],
      "boundaries/no-unknown-files": "error",
      "boundaries/no-unknown-dependencies": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          checkInternals: true,
          policies: [
            {
              from: { element: { type: "extension" } },
              allow: {
                to: {
                  element: { type: layers.map(layerType) },
                  file: { path: "src/*/*/index.ts" },
                },
              },
            },
            {
              from: { element: { type: "extension-test" } },
              allow: { to: { element: { type: "extension" } } },
            },
            {
              from: {
                element: {
                  type: ["extension", "herdr-plugin", "extension-test", "integration-test"],
                },
              },
              allow: { dependency: { relationship: { from: "internal" } } },
            },
            ...layerPolicies,
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.test.ts", "test/**/*.test.ts"],
    rules: {
      "boundaries/dependencies": "off",
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: String.raw`\.test\.[cm]?[jt]sx?$`,
              message: "Production code must not import test files.",
            },
            {
              regex: String.raw`^@(core|api|modules|features|views)/[^/]+/`,
              message: "Layer aliases must name a block only, never a private file or child part.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
