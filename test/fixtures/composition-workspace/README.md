# Composition test workspace

`node esbuild.mjs` generates `.vscode/settings.json` with an absolute path to the bundled fake Herdr executable. The fixture never discovers a Herdr executable from `PATH`. Its socket server is owned and stopped by the composition suite.
