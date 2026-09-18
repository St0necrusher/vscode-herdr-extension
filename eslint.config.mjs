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
      "import-x/resolver-next": [
        createTypeScriptImportResolver({ project: "./tsconfig.json" }),
      ],
      "import-x/extensions": [
        ".ts",
        ".tsx",
        ".cts",
        ".mts",
        ".js",
        ".jsx",
        ".cjs",
        ".mjs",
      ],
      "import-x/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx", ".cts", ".mts"],
      },
      "boundaries/elements": [
        element("feature-child", "src/features/*/*", ["feature", "module"]),
        element("infrastructure-child", "src/infrastructure/*/*", [
          "owner",
          "module",
        ]),
        element("capability", "src/capabilities/*", ["module"]),
        element("feature", "src/features/*", ["feature"]),
        element("infrastructure", "src/infrastructure/*", ["owner"]),
        element("extension", "src/extension"),
        element("extension-test", "test/extension"),
      ],
    },
    rules: {
      ...boundaries.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "import-x/no-cycle": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "PrivateIdentifier",
          message:
            "Use the TypeScript private modifier instead of JavaScript # private identifiers.",
        },
      ],
      "boundaries/no-unknown-files": "error",
      "boundaries/no-unknown-dependencies": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
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
              dependency: { source: "!#capabilities/*" },
              message:
                "Top-level capability boundaries must use a #capabilities package import alias.",
            },
            {
              disallow: { to: { element: { type: "feature" } } },
              dependency: { source: "!#features/*" },
              message:
                "Top-level feature boundaries must use a #features package import alias.",
            },
            {
              disallow: { to: { element: { type: "infrastructure" } } },
              dependency: { source: "!#infrastructure/*" },
              message:
                "Top-level infrastructure boundaries must use a #infrastructure package import alias.",
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
          paths: [
            {
              name: "vscode",
              message:
                "VS Code imports are limited to feature vscode children, VS Code infrastructure, and extension composition.",
            },
          ],
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
    files: ["src/features/*/*.ts"],
    ignores: [
      "src/features/*/index.ts",
      "src/features/*/*Feature.ts",
      "src/features/**/*.test.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "vscode",
              message:
                "Host-neutral feature state and policy must not use the VS Code API.",
            },
          ],
          patterns: [
            {
              group: ["./vscode.js", "./vscode/*", "./VsCode*"],
              message:
                "Host-neutral feature state and policy must not load host implementations.",
            },
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
          paths: [
            {
              name: "vscode",
              message:
                "The feature host composition entry must delegate direct VS Code API use to its vscode child.",
            },
          ],
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
    files: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "vscode",
              message:
                "Host-neutral tests must not load VS Code; use Extension Host tests for host integration.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/features/*/vscode/**/*.ts",
      "src/infrastructure/vscode/**/*.ts",
      "src/extension/**/*.ts",
    ],
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
  prettier,
);
