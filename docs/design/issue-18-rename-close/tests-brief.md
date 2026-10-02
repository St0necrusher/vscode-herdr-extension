# Brief: write the approved tests for issue #18

You were dispatched by the Claude session `vscode-herdr-extension-4c` (Herdr pane `w3:p27`). The user is in your tab. Your job is to coordinate writing the approved tests.

## Goal

Write exactly the approved scenarios T1–T5 below.

You are done when:
- every scenario is implemented through its stated seam;
- every worker diff has passed your review gate;
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` and `npm run test:extension` pass;
- the user accepts the result in your tab.

## Read first

- `gh issue view 18`: requirements.
- `docs/design/issue-18-rename-close/architecture.md`: the design, including the corrected Herdr fact table. Also read `progress.md` and append to it.
- ADRs `docs/adr/0005`–`0007` and `CONTEXT.md`. Use domain terms in test names and fixtures.
- `.claude/skills/tests/SKILL.md` (step 3 onwards), `.claude/skills/delegating-slices.md` and `.claude/skills/testing-scenarios.md`: the workflow. Steps 1–2 are done; the scenario list was approved on 2026-10-02.
- The implementation is uncommitted on branch `feat/18-rename-close`; read the diff with `git diff` and `git status`.

## Approved scenarios (nothing else)

**T1 — Socket mutations.** Seam: `JsonSocketHerdrSessionConnection`. Level: adapter integration. File: extend `test/integration/herdr-socket/JsonSocketHerdrSessionConnection.test.ts` and reuse its fake-socket harness.
- One table-driven test.
- Each of the six operations sends Herdr's documented method and params:
  - `pane.rename {pane_id, label}`, including `label: null`;
  - `tab.rename {tab_id, label}`;
  - `workspace.rename {workspace_id, label}`;
  - `pane.close {pane_id}`;
  - `tab.close {tab_id}`;
  - `workspace.close {workspace_id, close_group}` with both `true` and `false`.
- The fake socket must answer with Herdr's real result types: `pane_info`, `tab_info` and `workspace_info` for renames, `ok` for closes. Verify them with `herdr api schema --json`. This exact mismatch shipped once (renames expected `ok`) and was caught only by manual review.
- Each operation resolves only after the snapshot requested after the response has been delivered to the consumer.

**T2 — Pane and Tab closability (ADR 0005).** Seam: `PanesModel` state. Level: behavioral. File: `src/features/navigation/panes/PanesModel.test.ts`.
- Space with one Tab holding one Pane: neither the Pane nor the Tab is closable.
- Space with one Tab holding two Panes: the Panes are closable, the Tab is not.
- Space with two Tabs: both Tabs and their Panes are closable.

**T3 — Worktree Group detection (ADR 0007).** Seam: `SpacesModel` state. Level: behavioral. File: `src/features/navigation/spaces/SpacesModel.test.ts`.
- A primary checkout with a linked worktree of the same repository is a group, members primary first.
- A linked worktree Space on its own is not a group.
- A Space without a worktree is not a group.
- A primary checkout plus another unlinked Space of the same repository key is not a group. This is Herdr's rule.

**T4 — Close flows (ADR 0006).** Seam: the registered commands (`herdr.closePane`, `herdr.closeTab`, `herdr.closeSpace`, `herdr.closeGroup`) invoked with tree items, as `creation-commands.test.ts` does. Level: extension. File: new `test/extension/management-commands.test.ts`, registered in the `esbuild.mjs` entry points.
- Wire `NavigationFeature` with:
  - a mutable fake projection;
  - a recording `ActiveSessionManagement` fake that honours the real contract: on success it publishes the snapshot without the closed resources before resolving;
  - a recording `PaneTerminalClosing` fake.
- Close Pane sends `closePane` and closes only that Pane's editor.
- Close Tab sends `closeTab` and closes the editors of every Pane in that Tab.
- Close Space: cancelling the modal sends nothing; confirming sends `closeGroup: false` and closes that Space's Panes' editors.
- Close Group sends `closeGroup: true` and closes the editors of every Pane in every member Space.
- When Herdr rejects a close, an error is shown and `closePanes` is not called.
- Modals and error messages are stubbed at the `vscode.window` boundary the way the existing extension tests do it.

**T5 — Rename flows.** Same seam and file as T4.
- An empty Pane name sends `label: null`.
- Cancelling the input box sends nothing.
- Rename Tab on a singleton row sends that row's Tab id.

Optional scenarios O1–O5 in `architecture.md` were **not** selected; do not write them.

## Workflow

- Use `gpt-6-luna` workers with max thinking (`multi-agent-delegate`, kind `pi`). One worker per test file, each in its own git worktree, because the extension suite rebuilds `dist/` and parallel runs collide. Symlink `node_modules` and `.vscode-test` from the main checkout. Suggested split:
  - W1: T1;
  - W2: T2 and T3;
  - W3: T4 and T5.
- Personally review every worker diff, and bounce it until fixed. Accept a test only if:
  - it maps to an approved scenario;
  - it observes a public seam;
  - it derives its expectations from the ticket or Herdr's schema, not by repeating the production algorithm;
  - its fakes honour the real contract.

  Reject:
  - tests of private helpers or collaborator call counts;
  - contract-breaking fakes;
  - any production-code change made to suit tests.
- If a test exposes a production defect, stop and report it to the user; do not silently change production code or weaken the test.
- The only infrastructure change allowed is registering the new extension test file in `esbuild.mjs`.
- Apply each accepted worker diff to `feat/18-rename-close`, then run the full suite once in the main checkout.
- Chat with the user in Russian. Write code and docs in English.

## Boundaries

- Touch only the test files above, `esbuild.mjs` (entry-point registration only), and `docs/design/issue-18-rename-close/progress.md`.
- Do not commit, push, open PRs or close issues unless the user tells you to in your tab. The branch holds uncommitted implementation, `CONTEXT.md` and ADRs; leave them as they are.

## Output

Report only once, when the tests are complete and the user has accepted them; resolve questions with the user in your tab. When done, send the complete result with SendMessage to `vscode-herdr-extension-4c`, then stop. Include:
- the tests added and the requirement or risk each protects;
- the seam and level of each;
- the commands run and their outcomes;
- any production defects or limitations discovered;
- any reason the tests may be sensitive to implementation changes.
