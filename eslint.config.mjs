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
const legacyElements = ["capability", "feature", "feature-child", "infrastructure", "infrastructure-child"];
const newLayerType = (layer) => `layer-${layer}`;
const blockPattern = (layer) => (layer === "features" ? "!(navigation|sessions)" : "*");
const layerElements = layers.flatMap((layer) => [
  // Describe every directory recursively; source paths express directions within the captured block.
  element(newLayerType(layer), `src/${layer}/${blockPattern(layer)}/**/*`, ["block", "ancestors", "part"]),
  element(newLayerType(layer), `src/${layer}/${blockPattern(layer)}`, ["block"]),
]);
const layerPolicies = layers.flatMap((layer) => {
  const type = newLayerType(layer);
  const sameBlock = { type, captured: { block: "{{ from.element.captured.block }}" } };
  return [
    {
      from: { element: { type } },
      allow: {
        to: {
          element: { type: layerImports[layer].map(newLayerType) },
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
        element("feature-child", "src/features/{navigation,sessions}/*", ["feature", "module"]),
        element("infrastructure-child", "src/infrastructure/*/*", ["owner", "module"]),
        element("capability", "src/capabilities/*", ["module"]),
        element("feature", "src/features/{navigation,sessions}", ["feature"]),
        element("infrastructure", "src/infrastructure/*", ["owner"]),
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
              from: { element: { type: [...legacyElements, "extension"] } },
              allow: {
                to: { element: { type: layers.map(newLayerType) }, file: { path: "src/*/*/index.ts" } },
              },
            },
            {
              from: { element: { type: "capability" } },
              allow: {
                to: {
                  element: {
                    type: "capability",
                    fileInternalPath: "index.ts",
                  },
                },
              },
            },
            {
              from: { element: { type: "feature" } },
              allow: {
                to: [
                  {
                    element: {
                      type: "capability",
                      fileInternalPath: "index.ts",
                    },
                  },
                  {
                    element: {
                      type: "feature-child",
                      captured: {
                        feature: "{{ from.element.captured.feature }}",
                      },
                      fileInternalPath: "index.ts",
                    },
                  },
                  {
                    element: {
                      type: "feature-child",
                      captured: {
                        feature: "{{ from.element.captured.feature }}",
                        module: "shared",
                      },
                      fileInternalPath: "view/index.ts",
                    },
                  },
                ],
              },
            },
            {
              from: { element: { type: "feature-child" } },
              allow: {
                to: [
                  {
                    element: {
                      type: "capability",
                      fileInternalPath: "index.ts",
                    },
                  },
                  {
                    element: {
                      type: "feature-child",
                      captured: {
                        feature: "{{ from.element.captured.feature }}",
                        module: "capabilities",
                      },
                      fileInternalPath: "index.ts",
                    },
                  },
                  // Implementation shared by at least two sibling children of the same feature.
                  {
                    element: {
                      type: "feature-child",
                      captured: {
                        feature: "{{ from.element.captured.feature }}",
                        module: "shared",
                      },
                      fileInternalPath: ["index.ts", "view/index.ts"],
                    },
                  },
                ],
              },
            },
            {
              from: { element: { type: "infrastructure" } },
              allow: {
                to: [
                  {
                    element: {
                      type: "capability",
                      fileInternalPath: "index.ts",
                    },
                  },
                  {
                    element: {
                      type: "infrastructure-child",
                      captured: {
                        owner: "{{ from.element.captured.owner }}",
                      },
                      fileInternalPath: "index.ts",
                    },
                  },
                ],
              },
            },
            {
              from: { element: { type: "infrastructure-child" } },
              allow: {
                to: {
                  element: {
                    type: "capability",
                    fileInternalPath: "index.ts",
                  },
                },
              },
            },
            {
              from: { element: { type: "extension" } },
              allow: {
                to: {
                  element: {
                    type: ["capability", "feature", "infrastructure"],
                    fileInternalPath: "index.ts",
                  },
                },
              },
            },
            {
              from: { element: { type: "extension-test" } },
              allow: { to: { element: { type: "extension" } } },
            },
            {
              disallow: { to: { element: { type: "capability" } } },
              dependency: { source: "!@capabilities/*" },
              message: "Top-level capability boundaries must use an @capabilities import alias.",
            },
            {
              disallow: { to: { element: { type: "feature" } } },
              dependency: { source: "!@features/*" },
              message: "Top-level feature boundaries must use an @features import alias.",
            },
            {
              disallow: { to: { element: { type: "infrastructure" } } },
              dependency: { source: "!@infrastructure/*" },
              message: "Top-level infrastructure boundaries must use an @infrastructure import alias.",
            },
            {
              from: {
                element: {
                  type: [...legacyElements, "extension", "herdr-plugin", "extension-test", "integration-test"],
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
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/*/*Feature.ts", "src/features/*/index.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: String.raw`\.test\.[cm]?[jt]sx?$`,
              message: "Production code must not import test files.",
            },
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
    files: ["src/features/*/vscode/**/*.ts", "src/infrastructure/vscode/**/*.ts", "src/extension/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: String.raw`\.test\.[cm]?[jt]sx?$`,
              message: "Production code must not import test files.",
            },
          ],
        },
      ],
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
