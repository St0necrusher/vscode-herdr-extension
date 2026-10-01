# Issue #16 testing phase: handoff

Handoff from the coordinating session `claude-issue16` (Herdr pane w3:p19) on 2026-09-26. The production implementation of #16 is complete, committed on `main`, and passed the user's manual Extension Development Host check. The user explicitly authorized a separate testing phase run by its own agent.

## Your role

- You own the #16 testing phase. Follow the repository `tests` skill (`.claude/skills/tests/SKILL.md`) and [`testing-scenarios.md`](../../../.claude/skills/testing-scenarios.md).
- Agree the scenario list with the user in your tab first: groups "critical now", "optional", and "deliberately excluded", each scenario with observable behavior, protected requirement or risk, stable public seam, test level, and why existing coverage is insufficient. Write tests only after the user explicitly approves the list.
- Implementation of the approved tests goes to a pi agent `openai-codex/gpt-6-luna` (thinking level comes from pi settings) in its own Herdr tab, through the `multi-agent-delegate` skill. Give it a self-contained brief per bounded slice. You review every diff, send fixes, and commit on `main` directly (the whole history does), ending commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Production code changes are out of scope. If a test exposes a production defect, stop and report it to the user and to `claude-issue16`; do not fix it in the test phase and do not weaken the test.
- Reply to the user in Russian and refer to them with they/them. Keep code, commits and docs in English.
- When the phase is done, send the result (commits, scenario list, what was deliberately not tested, anything open) with SendMessage to `claude-issue16`.

## How the user wants to work

- Main review criterion: no over-engineering. Reject guards for impossible cases, extra flags, test-only abstractions or production exports for tests, contract-breaking mocks, and tests of private helpers or incidental wiring. Prefer a few behavioral tests through stable seams.
- The user's pi AGENTS.md makes luna extract conditions with two or more predicates into named boolean consts; luna tends to overapply it to single checks and untouched code. Ask for those to be reverted.
- Per slice run `npm run typecheck`, the focused tests, and eslint on the touched files. Full `npm run lint`, `npm run format:check`, `npm test`, `npm run test:extension` at the end.
- Luna agents compact at around 190k context; start a fresh one for a new slice after compaction.

## Read first

1. `AGENTS.md`, [`code-architecture.md`](../../architecture/code-architecture.md) (section "Tests and guardrails": colocated fast tests beside their owner, controlled external boundaries under `test/integration/`, a small critical VS Code suite under `test/extension/`; host-neutral models and policy loadable without `vscode`; no production exports or facades for tests).
2. [`architecture.md`](architecture.md): the final design. Its "Verification" section is the starting point.
3. [`progress.md`](progress.md): slices and commits. [`simplification-audit.md`](simplification-audit.md) (Russian): why the design is as it is, §5 lists accepted behavior changes.
4. Findings: [`s7-arrow-spike-findings.md`](s7-arrow-spike-findings.md) (arrow keys and wheel), [`pane-name-spike-findings.md`](pane-name-spike-findings.md) (tab name).
5. Code: `src/infrastructure/pane-editors/` and `src/extension/HerdrExtension.ts`.

## Current state

- Checks before the testing phase: `npm run typecheck`, `lint`, `format:check`, `build` pass; `npm test` (vitest) 53/53; `npm run test:extension` 7/7.
- Existing tests: vitest picks up `src/**/*.test.ts` and `test/integration/**/*.test.ts` (node environment, path aliases in `vitest.config.*`); the extension suite is `test/extension/*.test.ts` run by `vscode-test` (`.vscode-test.mjs`). `test/extension/pane-command.test.ts` covers the live Pane command.
- **There are no tests for `src/infrastructure/pane-editors/`.**

## Units and seams (for orientation, not a prescribed plan)

- Pure, `vscode`-free: `paneClientPolicy.ts` `desiredClient()` (which client for target/visibility/dimensions/intent); `paneTarget.ts` `paneTarget()` (live vs suspended placeholder per projection), `paneName()`; `stopWithEscalation.ts`.
- `PaneEditorSelectionModel.ts`: select/deselect/move events, idempotence; no `vscode`.
- `PaneEditorFocusTracker.ts`: Selection × window focus → per-identity `FocusChangeEvent`, immediate current event, dedupe, move semantics; uses `vscode.window` focus.
- `PaneTerminalSurface.ts`: `converge()` over facts; client lifecycle via `PaneClientFactory` (a real injected seam: fake observer/attach objects that honor the contract — synchronous create may throw, one `completion` that always resolves, idempotent `stop()`); input translation (arrow markers, DECCKM, bare arrows → SGR wheel); attach intent (`wanted | displaced | failed`), single warning; stopping attach serializes the next attach; placeholders; name publication. Uses `vscode.window.createTerminal`.
- `PaneTerminalSurfaceManager.ts`: `openPane` create/reveal/no-op, tab binding by temporary name, Selection writes, `pane.moved`, dispose on `Pseudoterminal.close()`, re-binding after a cross-group tab move, `herdr.activeTerminalIsPane` context key.
- `HerdrPaneObserver.ts` / `HerdrPaneAttach.ts`: real process boundaries (herdr CLI, node-pty).

## Behavior decided during manual testing (treat as accepted)

- Tab name is the raw `pane.terminalTitle` with spaces replaced by U+00A0; before binding the tab shows `${sessionId}:${paneId}`. The terminal is created without `name`.
- Moving a Pane tab between editor groups keeps the terminal and re-binds; closing the terminal disposes the Surface; the Herdr Pane stays alive.
- A hidden Pane tab runs no client.
- Out of scope / known: kitty flags leak (#29), intermediate frames on tab switch (#30), tab lost after moving into a new window and closing it (#31), no editor restoration on reload (#28).
