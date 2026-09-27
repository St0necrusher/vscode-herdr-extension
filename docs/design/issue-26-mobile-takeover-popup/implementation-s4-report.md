# Issue #26 — S4 implementation report: plugin registration and commands

## Assignment

Implement `TakeoverPluginRegistration` in `src/infrastructure/pane-editors/takeover/`, following D9, D12, Modules, Public seams and Failures in [`architecture.md`](architecture.md). The class:

- owns the `registered` fact and exposes `isRegistered()`;
- registers and disposes the two commands itself;
- runs `plugin list --json` at activation and refreshes the copy when the version changes.

Install copies the plugin, then links it. Remove unlinks the plugin, then deletes the copy. The slice also covers:

- `TAKEOVER_PLUGIN_ID`;
- composing the Registration only in `HerdrExtension`;
- the two `package.json` commands;
- a README note;
- the D12 exception in the responsibility map of `code-architecture.md`.

- Worker: `luna-26s4`, pi `openai-codex/gpt-6-luna` (max thinking), Herdr pane `w3:p1W`, worktree `/private/tmp/vscode-herdr-issue26-s4` (branch `issue26-s4`).
- Reviewer and integrator: `opus-impl26`.

## Files changed

- New: `src/infrastructure/pane-editors/takeover/TakeoverPluginRegistration.ts`.
- Changed:
  - `src/infrastructure/pane-editors/index.ts`: exports `TAKEOVER_PLUGIN_ID` and `TakeoverPluginRegistration`.
  - `src/extension/HerdrExtension.ts`: constructs the Registration first and disposes it last before the logger. `initialize()` starts `registration.initialize()` without awaiting it, so Sessions startup is never blocked.
  - `package.json`: two entries in `contributes.commands`.
  - `README.md`: the two commands, `node` on the Herdr server's PATH, and "run Remove before uninstalling".
  - `docs/architecture/code-architecture.md`: the Pane editors line records the `takeover/` mechanism, the D12 exception and the #26 design link.

## Behaviour

- **`initialize()`:**
  - Runs `herdr plugin list --json`.
  - Registered iff `result.plugins[].id` contains the id.
  - When registered, it compares the manifest `version` of the packaged copy (`dist/herdr-plugin`) and the global-storage copy. If they differ, it refreshes: unlink, re-copy, link.
  - Not registered: one info log line.
  - Any failure is logged as an error and never surfaces to the user.
- **Install:**
  - Runs `node --version`.
  - When already registered, unlinks first.
  - Copies the packaged directory over the copy (rm, then cp).
  - Runs `herdr plugin link <copy>` last.
  - Shows an info message. Failures show an error message with the CLI stderr as the reason.
- **Remove:** unlinks when registered, deletes the copy, and shows an info message.
- No `--session` is passed to any plugin CLI call (Q3).

## Review rounds

1. Round 1 requested four changes, all applied:
   - parse only the observed `plugin list` shape (`result.plugins`) instead of two shapes plus a validation ladder;
   - drop the missing-copy special case (`readOptionalManifestVersion` and `isMissingFile`), so a missing copy now fails `initialize()` with a log line;
   - remove the duplicate `registered = false` in `remove()`;
   - link the #26 design in the responsibility map.

   Accepted after round 1.

## Deviations

- Install also unlinks when the plugin is already registered. This choice is conservative until Q1 is answered, and it changes no contract.
- The `node --version` check runs on the extension host's PATH, not the Herdr server's. The README states the real requirement: `node` on the server's PATH.

## Q answers

- **Q1:** unresolved from the help and docs. The implementation uses the conservative unlink, replace copy, link sequence on a version change. **To verify in E2E.**
- **Q3:** the Herdr plugin docs (via https://herdr.dev/llms.txt) say plugin registration is global per user and that `plugin link` works with no server running. No help text requires `--session`, so none is passed. Whether `unlink` and `list` work offline is not documented: the CLI reference calls them API-backed. **To verify in E2E.**
- Observed: `herdr plugin list --json` returns `{"id":"cli:plugin","result":{"plugins":[],"type":"plugin_list"}}` (Herdr 0.9.0). The fields of a populated entry (assumed `id`) are **to verify in E2E**.

## Checks

`npm run typecheck` passed in the worker worktree and after integration.

## Commit

See [`implementation-status.md`](implementation-status.md).
