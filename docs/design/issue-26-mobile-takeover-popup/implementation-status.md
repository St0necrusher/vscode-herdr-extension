# Issue #26 — implementation status

Orchestrator: Claude session `opus-impl26` (Herdr pane `w3:p1S`, tab `w3:t19`), dispatched by `issue #26 prototype review` per [`orchestration-brief.md`](orchestration-brief.md). Contract: [`architecture.md`](architecture.md) at `4c704da` (incl. D12). Integration branch: `worktree-issue-26-mobile-takeover`.

## Shared contract fixed by the orchestrator

- Plugin id `st0necrusher.vscode-herdr-takeover`; popup entrypoint `takeover` (`popup`, 100%×100%, `node takeover-popup.js`).
- Manifest `version` stamped by `esbuild.mjs` from `package.json` `version`; the Registration compares packaged vs copied manifest versions.
- Popup env: `HERDR_VSCODE_TAKEOVER_SOCKET`, `HERDR_VSCODE_TAKEOVER_TOKEN`, `HERDR_VSCODE_TAKEOVER_PANE`; Herdr provides `HERDR_SOCKET_PATH`.
- Timings: `alive` 1 s; popup watchdog 3 s; `hello` deadline 5 s; D11 reopen 1/2/4/8 s.

## Slices

| Slice | Scope | Worker (pi `openai-codex/gpt-6-luna`, max) | Worktree / branch | State | Commit |
| --- | --- | --- | --- | --- | --- |
| S1 | `takeover/TakeoverPopupHost.ts` | `luna-26s1`, pane `w3:p1T` (closed) | `/private/tmp/vscode-herdr-issue26-s1` / `issue26-s1` | accepted after 1 rework round | `54cc17f` |
| S3 | `herdr-plugin/`, `esbuild.mjs`, `tsconfig.json`, lint boundary | `luna-26s3`, pane `w3:p1V` (closed) | `/private/tmp/vscode-herdr-issue26-s3` / `issue26-s3` | accepted after 2 rework rounds | `53b8565` |
| S4 | `takeover/TakeoverPluginRegistration.ts`, commands, README, code-architecture line, Registration composition | `luna-26s4`, pane `w3:p1W` (closed) | `/private/tmp/vscode-herdr-issue26-s4` / `issue26-s4` | accepted after 1 rework round | `91b53de` |
| S2 | `PaneTerminalSurface.ts` D1 sync/confirm/retract + host composition (`index.ts`, `HerdrExtension.ts`) | `luna-26s2`, pane `w3:p1X` (kept open for E2E fixes) | this worktree | accepted after 1 rework round + orchestrator lint fixes | `81945c8` |

Lesson: pi delegates report `working` while an `ask_user_question` dialog is open (Herdr skips screen detection for pi), so `wait` never sees `blocked`. The common brief now forbids interactive questions; S2 was briefed before that and asked once (answered: minimal fake `TakeoverOffers` also in `test/extension/pane-editors.test.ts`).

Split rationale: S4 composes only the Registration in `HerdrExtension`; wiring the host into Surfaces moves to S2, because it needs both the S1 class and the S2 constructor change. Worker briefs: the orchestrator's scratchpad (`issue26-common.md`, `issue26-s<N>.md`); their content is summarised in each slice report.

## E2E fixes (owner-driven live E2E, 2026-09-27; worker `luna-26s2` unless noted)

| Commit | Finding → fix |
| --- | --- |
| `5536442` | `herdr plugin list --json` keys entries by `plugin_id`, not `id`, so the plugin would read as unregistered after the next activation → parse `plugin_id`. |
| `8664bdb` | Owner socket path was 108 bytes under the macOS `$TMPDIR`, over the 104-byte Unix socket limit (`listen EINVAL`) → name `herdr-takeover-<16 hex>.sock` (85 bytes). |
| `f55a7e8` | The Herdr socket closes a connection after one non-subscription response, so the popup exited after its first mirror frame → one short connection per mirror poll. |
| `c0302dd` | Banner cut at phone width → word-wrapped banner rows. |
| `9ef8074` | D11 amendment `ab0e2a2` (design owner; the owner accepted a budget of 4): reopen budget per offer, not reset on `hello`. |
| `7dce6c2` | D13 (`a6e22a4`): a displaced, observing Surface enables SGR mouse and reattaches on a non-wheel press (the click is not forwarded). |
| `50b4b88` | Owner-approved change to D13: xterm.js reports focus as soon as DECSET 1004 is enabled, so re-emitting modes produced a synthetic focus-in that reattached immediately (the phone could not keep the Pane) → focus reporting dropped; click only. **Not yet recorded in `architecture.md`.** |
| `4ff6048` | Owner decision: a keyboard confirm is forwarded to the Pane through the Herdr socket `pane.send_text` before the popup confirms (mouse and wheel confirms are not forwarded). This lifts the architecture exclusion "Forwarding the confirming input to the Pane". Orchestrator note: Herdr does not close the connection after a `send_text` response, so completion waits for the response line. **Not yet recorded in `architecture.md`.** |

Owner decisions during E2E, to be reported to the design owner in one batch (the owner asked not to ping per decision):
- The popup border and title cannot be removed in Herdr 0.9.0 (`popup_size.rs` hardcodes a 1-cell border; `client_shell.rs` always renders a title). No Herdr request.
- D11 budget of 4 accepted.
- D13 reduced to click only (above).
- Forward the confirming keystrokes to the Pane (above).

## E2E results (disposable Pane `w3:p1Y`, tab `e2e-26`, Extension Development Host)

| Check | Result |
| --- | --- |
| VS Code → phone (long press) → VS Code (click), geometry and input follow | pass (after the fixes above) |
| First input after the phone held the Pane | pass (no lost characters reported) |
| Phone offline → reconnect | pass |
| Competing modal (`ui_busy`: Herdr Settings) | pass: focusing VS Code closed Settings and our popup opened |
| Window reload | popup gone; no fresh popup, because the Pane editor tab is not restored after reload (Pane editor restoration is not implemented, outside #26) |
| `kill -STOP` extension host | pass: popup exited 2.4 s after STOP; after CONT the host reopened a popup |
| Herdr stop/start, `reload-config` | skipped by the owner |
| Confirming keystroke reaches the Pane | pass after `4ff6048` |
| Q1 (Install over an existing registration picks up new files) | pass: re-running Install (unlink, copy, link) served the updated popup |
| Q2 `HERDR_SOCKET_PATH` present in the popup | pass (the mirror works) |
| Q3 offline `unlink`/`list` | not verified (no server stop) |

Observation: a popup change only reaches Herdr after **Install** is run again, because Herdr runs the global-storage copy and the refresh on activation keys on the manifest version, which stays `0.0.1` during development.

Observation: a host that exits without `dispose()` (killed Extension Development Host) leaves its socket file in `$TMPDIR`. It is harmless, and cleaning it up is not implemented.

## Final checks (after `4ff6048`)

`npm run typecheck` ✓ · `npm run lint` ✓ · `npm run format:check` ✓ · `npm run build` ✓ · `npm test` ✓ (9 files, 73 tests). `npm run test:extension` not run.

## Current state

All slices and E2E fixes are committed and pushed. Open items:
- record the D13 click-only change and the keystroke forwarding in `architecture.md` (design owner);
- Q3;
- the owner's approval of the test scenario list before any new tests;
- the owner decides whether to run Remove and close the E2E tab.

Worker `luna-26s2` (pane `w3:p1X`) and the E2E tab `e2e-26` are closed. The owner keeps the plugin registered and will reinstall it later.
