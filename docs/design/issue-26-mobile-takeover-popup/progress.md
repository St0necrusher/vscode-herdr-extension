# Issue #26 — progress

Status: architecture approved 2026-09-27; implementation in progress (orchestrator delegate).

Requirements: [#26](https://github.com/St0necrusher/vscode-herdr-extension/issues/26), parent #9, prerequisite #16 (implemented, [`../issue-16-focus-control-handoff/architecture.md`](../issue-16-focus-control-handoff/architecture.md)).

## Grounding (2026-09-27)

- Read #26 (no comments), `CONTEXT.md`, `code-architecture.md`, #16 architecture, current `src/infrastructure/pane-editors/`.
- Prototype `655c1a9` (worktree `/private/tmp/vscode-herdr-direct-attach-prototype`): `prototype/plugin-yield-popup/` (manifest, `popup.cjs`) and `prototype/direct-attach-handoff/popup-probe.cjs` (VS Code side: Unix socket 0600, `alive` heartbeat 1 s, popup watchdog 4 s, generation-bound `confirm` → `accepted` → release attach). The committed `extension.js` is the later visibility probe with the popup disabled; the popup-wired extension that passed the live gate is not committed. Evidence: `prototype/direct-attach-handoff/EVIDENCE.md`.
- Herdr 0.9.0 API schema facts:
  - `plugin.pane.open` params: `plugin_id`, `entrypoint`, `placement` (`popup`…), `width`/`height`, `workspace_id`, `target_pane_id`, `env`, `focus`, `cwd`. Result `plugin_pane_opened` carries `plugin_pane.pane.pane_id` → the extension can close exactly its own popup with `plugin.pane.close <pane_id>`.
  - `popup.close` takes no params (closes whatever occupies the global slot) → must not be used.
  - `ui_busy` is not in the schema's enum (error codes are free strings); documented in Herdr docs only.
  - `plugin.pane.open` requires the plugin to be registered (`plugin link`/`install`), which is global per user.
- `herdr plugin list --json` is currently empty.

- Herdr focus is server-wide: the snapshot carries `focused_pane_id` and the extension already subscribes to `pane.focused`. Each Herdr Session has its own server and therefore its own popup slot.
- Event catalogue has no custom/plugin events; `pane.report_metadata` exists. Placements: `overlay`, `popup`, `split`, `tab`, `zoomed`.

## Owner input (2026-09-27)

- Offer only when the Pane VS Code has attached is also Herdr's focused Pane in that Session; a VS Code-selected Pane that Herdr does not show needs no offer (Herdr already hands geometry to the phone).
- Prototype behavior confirmed by the owner: popup visible in desktop Herdr and on RootShell; switching to desktop Herdr blurred VS Code and retracted the popup immediately; on the phone `y` closed the popup and the phone took geometry. No focus problems observed.
- Plugin runtime: prefer something with fewer dependencies than tying to VS Code's Node; if equal, Node.
- Owner proposes a tap/click target (overlay) instead of typing `y`.

## Decisions (2026-09-27)

- **D1.** Offer condition: attached ∧ window focused ∧ Pane == Herdr `focused_pane_id`. Agreed.
- **D2.** Plugin runtime: Node from PATH, not VS Code's Electron. Agreed.
- **D3.** Run a live spike (separate Opus 5.5 agent, owner participates) on: tap delivery to a popup from RootShell, `overlay` placement, and whether a plain tap/click into the attached Pane itself is observable by the extension (no popup at all). Report: [`spike-tap-signal.md`](spike-tap-signal.md).

## Spike result (2026-09-27, [`spike-tap-signal.md`](spike-tap-signal.md), branch `spike/issue-26-tap-signal` @ `fedf6ad`, not pushed)

- No-UI signal (E1) is not feasible: the takeover lock is geometry-only; phone input reaches the Pane process but nothing is API-visible.
- Plugin `popup` is the chosen surface: visible on phone and desktop TUIs, invisible in VS Code, does not change `focused_pane_id`, survives phone offline→reconnect. RootShell delivers only long presses; desktop TUI short clicks work.
- `overlay` rejected: it is a real Pane that steals server focus (breaks D1) and is opaque.
- The popup takes a desktop TUI's keyboard even with `--no-focus`.
- CLI `plugin pane open` for a popup returns `{"type":"ok"}` with no `pane_id`; popups are not in the snapshot.
- Spike delegate: Claude session `opus-spike26`, Herdr tab `w3:t17`.
- Update (spike commit `b44966f`): E5 — plugin `[[events]]` hooks accept only a subset of socket event names; no client/input/mouse hooks. E6 — full-screen (`100%`) popup mirroring the Pane via `pane read --format ansi` polling under a one-line banner worked live on the phone (scrollable, long press confirms, offline→reconnect OK, `focused_pane_id` untouched). Untested: alternate-screen agent TUIs at desktop geometry cropped to phone width, colours, latency. Owner liked it and wants the banner kept.

## Proposed (not yet agreed)

- Retraction without `pane_id`: the popup process is the only thing that closes the popup (exits on socket close, heartbeat loss, or a `retract` message); the extension never needs `plugin.pane.close`/`popup.close`.
- Confirm: any mouse press or `y`; Enter/Space ignored to avoid stray desktop-TUI keystrokes. Dismiss: Esc/`q`. Copy says "press and hold".

- Offer condition: attached ∧ window focused ∧ Pane == Herdr `focused_pane_id` → at most one offer per Session; cross-window contention on one Pane is impossible (single `--takeover` attach).
- Plugin runtime: Node from PATH (no VS Code Electron), TypeScript bundled by the existing esbuild; checked at install. Alternative: Go static binary per arch.
- Plugin source at repo-root `herdr-plugin/`, built to `dist/herdr-plugin/`, packaged in the VSIX.
- Install: explicit command copies the built plugin to `globalStorageUri` and `herdr plugin link`s that stable copy; upgrade overwrites the copy; remove command unlinks.

## Design discussion (2026-09-27)

- Owner chose the full-screen mirror popup in #26 (no separate ticket). Any input (key, click/tap, wheel) confirms immediately with no ack wait; VS Code focus loss or an editor tab switch retracts. Recorded as D3/D4/D7/D10 in [`architecture.md`](architecture.md).
- Owner asked whether FocusTracker covers this: it supplies the focus part of D1 through Surface `visibility`, but it cannot express "attached" (after Yield it still reports focused) → D8.
- Install/remove as explicit commands, no setting; missing plugin degrades silently → D9.
- Spike delegate `opus-spike26` closed (tab `w3:t17`).
- Architecture draft awaiting owner approval; implementation not authorized.
- Owner raised Herdr crash/restart/reload cases → D11 (host maintains popup with bounded reopen) plus failure paths relying on #16 projection handling.

## Reconciliation (2026-09-27, parent review of S1–S4 up to `8664bdb`)

- Surface, host, popup, registration and composition conform to `architecture.md` (D1, D5, D6, D8, D9, D11, D12).
- **Amendment D11:** the reopen budget is per offer and is not reset by `hello`. The old rule allowed an endless reopen loop when a popup connects and then exits immediately. Sent to the orchestrator for S1 rework.
- Minor notes, no change required: a redundant `projection.kind === "connected"` check in the Surface; the Install command checks `node` in VS Code's PATH, not the Herdr server's; `herdr-plugin/*.ts` sources are not excluded in `.vscodeignore`.
- Correction: a new Herdr socket connection per mirror poll is required, not wasteful. Herdr closes the connection after answering one request (found live by the orchestrator, when the popup vanished right after opening). The owner accepted the D11 amendment in the orchestrator's tab.

## Implementation complete (orchestrator report, HEAD `0dbf52c`)

- Slices and E2E fixes: see [`implementation-status.md`](implementation-status.md). Owner decisions recorded in the architecture as D13 (revised to click only), D14 (keystroke forwarding) and D15 (popup border limitation); D11 per-offer budget of 4 accepted.
- Live E2E passed: VS Code → phone → VS Code, first input, offline reconnect, `ui_busy`, extension-host `kill -STOP`/`CONT`, keystroke forwarding. Window reload was not applicable, because tabs are not restored (#28). The owner skipped Herdr stop/start and reload-config.
- Q1 pass, Q2 pass, Q3 not verified.
- Parent reconciliation of `8664bdb..0dbf52c`: conforms. Parent checks: typecheck, lint, format:check and `npm test` (73) pass.

## Final advisory review (2026-09-27, snapshot `main...2ad99ec`, two pi `gpt-6-luna` max reviewers)

Triage by the parent (reports: standards, spec; kept in the job scratchpad):

| # | Axis | Finding | Triage | Recommendation |
| --- | --- | --- | --- | --- |
| R1 | both | Installing while an eligible attach exists gives no popup until the next attach generation. `offer()` returns an inert handle when unregistered, and the Surface keeps it (`PaneTerminalSurface.ts:310-313`). Remove while a popup is shown leaves that popup able to confirm. | **Confirmed defect, important.** Reachable in the first-run path: run Install from the palette while the Pane is attached and focused, then go to the phone, and no popup appears. Root cause: the host discards requests instead of owning them across registration changes. | The host keeps the pending request (a state waiting for registration) instead of returning an inert handle. The registration notifies the host on install/remove. The host starts an attempt on install and retracts a shown popup on remove. No Surface change. |
| R2 | standards | The Install preflight checks `node` on VS Code's PATH, not the Herdr server's. | Risk, minor. A false positive is possible; a failure is still logged by the host (no `hello`). | Drop the misleading preflight, or keep it and label it as a VS Code-side check only. Do not add a server-side probe. |
| R3 | standards | Registration initialize/refresh `execFile` can complete after dispose. | Risk, minor. Only in a ~100 ms activation window, or during a version refresh at deactivation; the end state (a link to the copy) stays coherent. | No action. |
| R4 | spec | The popup forwards per stdin chunk; a split escape or paste may be truncated; it yields even if `pane.send_text` errors. | Risk, minor. A single keypress arrives whole in practice; forwarding is best-effort by D14. | No action; note that D14 is best-effort. |

Owner decisions (2026-09-27): R1 accepted as a known limitation. The plugin is installed once; after Install, a popup appears on the next attach generation (a focus change or tab switch). R2, R3 and R4 accepted as they are. No post-review code changes.

State: **implementation ready for human review.** Next: the test phase with a separate Opus 5.5 orchestrator, which discusses scenarios with the owner and reports only the final result.

## Testing phase done (2026-09-27, orchestrator `opus-test26`, HEAD `c5ce753`)

- The owner approved these scenarios: A1–A4 (Surface), B1–B6 (host), C1–C5 (popup), O1 (activation detection and refresh); O2 (Install/Remove) was optional and taken. Details: [`testing-report.md`](testing-report.md).
- Parent verification: the diff `6f40260..c5ce753` touches only test files and the report. typecheck, lint, format:check, `npm test` (12 files, 102 tests) and build pass.
- Still open: `npm run test:extension` is environment-blocked. The worktree's IPC socket path exceeds the macOS limit; from a short path, 7 tests pass and 1 fails because a pre-existing assertion expects the test window to be focused. Q3 is unverified.
