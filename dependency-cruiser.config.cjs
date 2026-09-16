/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "features-do-not-depend-on-adapters-or-extension",
      severity: "error",
      from: { path: "^src/features/" },
      to: { path: "^src/(adapters|extension)/" },
    },
    {
      name: "adapters-do-not-depend-on-extension",
      severity: "error",
      from: { path: "^src/adapters/" },
      to: { path: "^src/extension/" },
    },
    {
      name: "extension-uses-public-entry-points",
      severity: "error",
      from: { path: "^src/extension/" },
      to: { path: "^src/(features|adapters)/.+/internal/" },
    },
    {
      name: "adapters-use-feature-public-entry-points",
      severity: "error",
      from: { path: "^src/adapters/" },
      to: { path: "^src/features/.+/internal/" },
    },
    {
      name: "lifecycle-feature-is-isolated",
      severity: "error",
      from: { path: "^src/features/lifecycle/" },
      to: {
        path: "^src/features/",
        pathNot: "^src/features/lifecycle/",
      },
    },
    {
      name: "herdr-lifecycle-adapter-is-isolated",
      severity: "error",
      from: { path: "^src/adapters/herdr/lifecycle/" },
      to: {
        path: "^src/adapters/",
        pathNot: "^src/adapters/herdr/lifecycle/",
      },
    },
    {
      name: "vscode-lifecycle-adapter-is-isolated",
      severity: "error",
      from: { path: "^src/adapters/vscode/lifecycle/" },
      to: {
        path: "^src/adapters/",
        pathNot: "^src/adapters/vscode/lifecycle/",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { extensions: [".ts", ".js", ".json"] },
  },
};
