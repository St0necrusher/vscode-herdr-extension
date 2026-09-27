# Issue #26 — testing phase brief

Dispatched 2026-09-27 by Claude session `issue #26 prototype review` (Herdr pane `w3:p19`, design owner). You are `opus-test26`, the testing orchestrator. The repository owner (the user) works with you directly in your Herdr tab. **Talk to the user in Russian; write code, docs, commits and reports in English.**

## Inputs

- Branch `worktree-issue-26-mobile-takeover`, worktree `/Users/kuzmichev/dev/vscode-herdr-extension/.claude/worktrees/issue-26-mobile-takeover`, starting at `66c34e6`. The implementation is done and reviewed. It is the system under test; do not change production behavior.
- Design: [`architecture.md`](architecture.md) (D1–D15, Known limitations, "Verification plan (preliminary)"). History: [`progress.md`](progress.md), [`implementation-status.md`](implementation-status.md), `implementation-s*-report.md`.
- Test-scenario guidance: `.claude/skills/testing-scenarios.md` (post-implementation branch). Project rules: `docs/architecture/code-architecture.md` ("Tests and guardrails"), `AGENTS.md`, `CONTEXT.md`.
- Existing tests to extend or learn from:
  - `src/infrastructure/pane-editors/PaneTerminalSurface.test.ts` (vitest, local `vscode` mock, fake `PaneClientFactory`, and already a minimal fake `TakeoverOffers`);
  - `test/integration/pane-editors/HerdrPaneAdapters.test.ts` (fake `herdr` executable, real node-pty);
  - `test/extension/pane-editors.test.ts`.

## Step 1: agree the scenario list with the owner (before any test code)

Reconcile the preliminary plan in `architecture.md` with the actual code and existing coverage. Present **critical**, **optional** and **excluded** groups. For each scenario give the observable behavior, the requirement or risk it protects, the stable seam, the test level, and why existing coverage is insufficient. Starting candidates:

- **Surface:**
  - offers only under D1;
  - retracts on each loss of D1 and on dispose;
  - confirm → observer with intent `displaced`, no reattach until local input or a non-wheel click (D13);
  - wheel, releases and focus reports are ignored while displaced;
  - a stale confirm after a reattach does nothing.
- **`TakeoverPopupHost`** (real Unix socket, fake `herdr`):
  - open arguments and env;
  - token checks;
  - exactly one `onConfirm`;
  - `retract`;
  - D11: at most 4 reopens per offer, not reset by `hello`, none after `retract`;
  - "plugin not found" ends the offer;
  - dispose cleans up the socket.
- **Popup program** (node-pty, fake owner socket, fake Herdr socket):
  - a key → `pane.send_text` then `confirm`;
  - a mouse press or wheel → `confirm` only;
  - focus reports do not confirm;
  - it exits on `retract`, owner close, 3 s without `alive`, or a failed Herdr connect;
  - one Herdr connection per mirror poll.
- **Optional:** `TakeoverPluginRegistration` with a fake `herdr` (list, install, remove, refresh on a version change).

Get the owner's explicit approval of the list before step 2.

## Step 2: implement the approved scenarios

- Delegate implementation to pi `openai-codex/gpt-6-luna` (max thinking) workers in Herdr tabs via the `multi-agent-delegate` skill, instructed with the `implement-slice` skill. Keep a worker `ongoing` until its part is accepted, then close its tab. Parallel workers get separate git worktrees branched from this branch; integrate their work here.
- Review every diff yourself and send concrete rework until it is right. Commit per accepted part on this branch and push this branch. Never push to `main`, never force-push, never merge.

## Rules (owner's standing preferences)

- Behavioral tests that survive refactoring, at the narrowest stable public seam. No unit tests of private helpers or pure plumbing, and no assertions on private fields or incidental wiring.
- **Never adapt production code to tests:** no new exports, hooks, test flags, loosened visibility, or other backdoors. On every review check `git diff` outside test files; it must be empty. If a scenario cannot be tested without a production change, stop and ask the owner.
- No defensive over-engineering in test helpers either; keep fakes minimal and realistic (no contract-breaking mocks).
- Run `npm run typecheck && npm run lint && npm run format:check && npm test` for each accepted part. Run `npm run build` once at the end. If `npm run test:extension` is run and fails for environment reasons, record the reason.
- Do not edit `architecture.md` or `progress.md`, which belong to the design owner. Record your work in `docs/design/issue-26-mobile-takeover-popup/testing-report.md`: the approved scenario list, the worker for each part, the review rounds, commits, check results, and anything left open.
- **Report to me only once, at the end.** Send no intermediate messages; resolve questions with the owner in your tab. When everything is done, send `issue #26 prototype review` one SendMessage with commits, check results, a scenario coverage summary, and open items. Then stop and keep your tab open.
