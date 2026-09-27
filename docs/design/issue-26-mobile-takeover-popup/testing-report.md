# Issue #26 — testing report

Testing orchestrator: Claude session `opus-test26` (Herdr pane `w3:p21`), dispatched by `issue #26 prototype review` per [`testing-brief.md`](testing-brief.md). System under test: branch `worktree-issue-26-mobile-takeover` at `6f40260`. Production code was not changed: every accepted part touched only its test file.

## Approved scenario list

Reconciled from the preliminary plan in [`architecture.md`](architecture.md) with the code after D13–D15 and the final-review triage. Before this phase the takeover code had no tests. The Surface tests and the extension suite had only an inert `TakeoverOffers` stub. The owner approved all critical scenarios plus the recommended optional ones: O1 promoted to critical and O2 taken. O3–O5 were not taken.

**Critical**

| ID | Behavior | Protects | Seam / level |
| --- | --- | --- | --- |
| A1 | Offer only under D1, once per attach generation; none while observing or while Herdr focuses another Pane | D1, D8 | Surface constructor + `Pseudoterminal`, recording `TakeoverOffers` fake / behavioral |
| A2 | Retract exactly once on blur, editor switch, Herdr focus moving away, attach displaced, projection stale, dispose; new offer when D1 holds again | D1, D7 | same |
| A3 | Confirm → attach released, observer, offer retracted, no self-reattach; SGR mouse on while displaced (again after each screen reset), off on leaving; wheel/release/focus/bare arrows ignored; non-wheel click reattaches without forwarding; keyboard reattaches and forwards | D6, D13 | same |
| A4 | Stale confirm (after reattach, after D1 loss, after dispose) does nothing | offer generation | same |
| B1 | `plugin pane open` args and env (no `--session` for `default`); `alive` heartbeat; `confirm` → `onConfirm` exactly once | protocol, D4 | `TakeoverPopupHost` + real Unix socket in the real tmpdir + fake `herdr` / adapter integration |
| B2 | Foreign or stale token gets `retract`; `confirm` without `hello` ignored | stale/foreign confirm | same |
| B3 | `retract()` and a replacing `offer()` retract the shown popup | D5, single offer | same |
| B4 | D11: at most 4 reopens per offer after open failure, missing `hello`, or close without confirm; `hello` does not reset the budget; no reopen after `retract` | D11 and its amendment | same (fake timers for timers only) |
| B5 | `plugin_not_found` ends the offer; unregistered → nothing launched | D9 | same |
| B6 | `dispose` retracts the shown popup and removes the socket file | cleanup | same |
| C1 | `hello <token>`, `pane.read {visible, ansi}`, mirror text shown and still updated after Herdr closes each read connection | main path; regression `f55a7e8` | popup process under node-pty + fake owner and Herdr sockets / integration |
| C2 | Key → `pane.send_text` with the key bytes, then `confirm`, then exit | D4, D14 | same |
| C3 | Mouse press and wheel → `confirm` and exit, no `send_text` | D4, D14 | same |
| C4 | Focus reports and mouse release do not confirm; popup keeps running | D4 | same |
| C5 | Exit without confirm on `retract`, owner close, 3 s without `alive` (alive past 3 s with heartbeats), unreachable owner socket, unreachable Herdr socket, Herdr read error | D5, watchdog, failures | same |
| O1 | Activation: `plugin list --json` with our `plugin_id` → registered; version change → unlink, copy, link; equal version → no relink; absent → unregistered | regression `5536442` | `TakeoverPluginRegistration` + fake `herdr` + minimal `vscode` mock / adapter integration |

**Optional (taken):** O2. Install copies and links, then shows an info message and sets registered. Remove unlinks and deletes the copy. A link failure shows an error with the reason, and the plugin stays unregistered.

**Optional (not taken):** O3, a `pane.send_text` failure still confirms. O4, D13 after a natural (non-Yield) displacement. O5, socket mode `0600`.

**Excluded:** private helpers (`classifyDisplacedInput`, `isConfirmInput`, `wrapBanner`, `pluginListContains`); mirror rendering fidelity, banner text and wrapping, popup border (D15); terminal-mode restore; popup behavior with missing env; composition in `HerdrExtension`; manifest version stamping in `esbuild.mjs`; log message text; the accepted limitations R1–R4; manual E2E items already run live.

## Parts, workers and review rounds

All workers ran pi `openai-codex/gpt-6-luna` (max thinking), in parallel, in separate worktrees `/private/tmp/vscode-herdr-test26-{a..d}` branched from `6f40260`. Worktrees and branches were removed after integration. No worker went above 141k of its 272k context.

| Part | Worker | Test file | Rounds | Review findings sent back | Commit |
| --- | --- | --- | --- | --- | --- |
| A | `luna-t26a` | `src/infrastructure/pane-editors/PaneTerminalSurface.test.ts` | 1 rework | A1 did not isolate "observing" from "Herdr focus elsewhere"; redundant `retracted` flag; a meaningless assertion on a stopped attach | `e08acc9` |
| B | `luna-t26b` | `test/integration/pane-editors/TakeoverPopupHost.test.ts` | 3 reworks | (1) over-engineered waiting machinery, pid tracking and a per-invocation plan list, replaced by `vi.waitFor` and four short D11 stories (613 → 436 lines); (2) a race in B5: time advanced before the host saw `plugin_not_found`, so the hello deadline could reopen, now waits for the host's log reaction; (3) the file took ~45 s because fake time ran at real speed, now ~12 s | `31e5e1d` |
| C | `luna-t26c` | `test/integration/herdr-plugin/takeoverPopup.test.ts` | 1 rework | unused fixture fields, a defensive `listening` branch, a PATH fallback, a redundant assertion | `2c43ee3` |
| D (O1, O2) | `luna-t26d` | `test/integration/pane-editors/TakeoverPluginRegistration.test.ts` | 1 rework | fixture exposed fields that no test reads | `bc2f81b` |

On every review `git status` / `git diff` outside the owned test file was empty. No production defect and no untestable scenario was found.

## Checks

- For each accepted part, in this worktree: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` all pass. The new file was re-run 2–3 times; every run passed.
- Final: `npm test` shows 12 files and 102 tests passing (73 before this phase). Takes about 12 s: the popup and host integration files take ~11–12 s each, run in parallel, and spend it on real heartbeat waits and process launches.
- `npm run build` passes and produces `dist/herdr-plugin/{takeover-popup.js, herdr-plugin.toml}`.
- `npm run test:extension` fails for environment reasons:
  - In this worktree it cannot start: VS Code's IPC socket path under `.claude/worktrees/issue-26-mobile-takeover/.vscode-test/…` exceeds the macOS 104-byte Unix socket limit (`listen EINVAL`).
  - From a short path (`/private/tmp`, same commit `31e5e1d`) it shows 7 passing and 1 failing. The `before all` hook of "Pane editors in VS Code" asserts that the VS Code test host window is focused, which it was not while the owner used another window. No test in that suite was changed in this phase.

## Open items

- `npm run test:extension` needs a short checkout path and a focused test-host window. It was not re-run under those conditions.
- Q3 (offline `plugin unlink`/`list`) is still unverified, as it was after implementation. It is outside the automated tests.
