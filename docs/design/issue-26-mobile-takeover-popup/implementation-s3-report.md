# Issue #26 — S3 implementation report: Herdr popup plugin

## Assignment

Implement the plugin in `herdr-plugin/`, following D3, D4, D5, D10, Data flow steps 4–5 and Failures in [`architecture.md`](architecture.md).

The manifest (`herdr-plugin/herdr-plugin.toml`) declares:

- plugin `st0necrusher.vscode-herdr-takeover`;
- popup entrypoint `takeover`, 100%×100%, `node takeover-popup.js`;
- a version placeholder.

The popup program (`herdr-plugin/takeoverPopup.ts`) has four parts:

- **Owner socket client:** `hello <token>`; exits on `retract`, socket close, or 3 s without `alive` or without a connection.
- **Mirror:** polls `pane.read {pane_id, source: "visible", format: "ansi"}` over `HERDR_SOCKET_PATH` under an inverse banner, "Hold to continue here · VS Code has this Pane". It exits when the Herdr socket is lost.
- **Input:** any key, mouse press or wheel sends `confirm` and exits. Focus reports and mouse releases do not.
- **Terminal modes:** alternate screen, hidden cursor, SGR mouse 1000/1006, autowrap off. All are restored on exit.

`esbuild.mjs` bundles the popup and writes the manifest stamped with the `package.json` version into `dist/herdr-plugin/`.

- Worker: `luna-26s3`, pi `openai-codex/gpt-6-luna` (max thinking), Herdr pane `w3:p1V`, worktree `/private/tmp/vscode-herdr-issue26-s3` (branch `issue26-s3`).
- Reviewer and integrator: `opus-impl26`.

## Files changed

- New: `herdr-plugin/herdr-plugin.toml`, `herdr-plugin/takeoverPopup.ts`.
- Changed:
  - `esbuild.mjs`: popup bundle and manifest stamping.
  - `tsconfig.json`: includes `herdr-plugin/**/*.ts`.
  - `eslint.config.mjs`: one boundaries element, `herdr-plugin`. With no dependency policy, the default `disallow` stops the plugin from importing extension code.
  - `package.json`: the `lint` script covers `herdr-plugin`.

## Review rounds

1. Round 1:
   - dropped the deferred confirm (`hello` is queued right after `createConnection`, so `confirm` is always queued after it);
   - exits explicitly with `process.exit()`;
   - replaced the response-validation ladder and request-id matching with a typed cast (only one read is in flight);
   - redraws in place instead of clearing the screen on every poll (flicker);
   - turned autowrap off so desktop-width lines are cropped;
   - kept only one resize listener.
2. Round 2:
   - simplified the owner-connection deadline (confirm exits in the write callback);
   - added the lint boundary element and the `lint` script entry;
   - used the repository's `eslint-disable-line no-control-regex` convention for the three escape-sequence regexes.

   Accepted after round 2.

## Deviations

- The popup exits on an error response to `pane.read` (for example, the Pane is gone) as well as on a lost connection. The architecture names only socket loss.
- When the source screen is taller than the popup, the mirror shows the bottom rows of the visible screen. Lines are cropped at the popup width, not wrapped.
- Guardrail change: adding the `herdr-plugin` boundaries element to `eslint.config.mjs` was approved by the orchestrator as a minimal lint-coverage change.

## Q answers

- **Q2:** yes. The Herdr v0.9.0 plugin runtime docs (`docs/next/website/src/content/docs/plugins.mdx` in the Herdr repository) say `HERDR_SOCKET_PATH` is injected into runtime plugin commands, which include popup panes. The popup exits if the variable is missing; there is no fallback discovery. Live confirmation is part of E2E.
- Observed `pane.read` response (Herdr 0.9.0, read-only request): `result.type = "pane_read"`, with `result.read = { pane_id, workspace_id, tab_id, source, format, text, revision, truncated }`.

## Checks

- `npm run typecheck`, `node esbuild.mjs` (produces `dist/herdr-plugin/takeover-popup.js` and the manifest with version `0.0.1`) and `npx eslint herdr-plugin` all passed in the worker worktree.
- Not run: a fake-owner smoke test and a live run of a registered plugin. Both are left for E2E.

## Commit

See [`implementation-status.md`](implementation-status.md).
