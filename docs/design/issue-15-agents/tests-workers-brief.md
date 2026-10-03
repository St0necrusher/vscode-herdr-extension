# Common brief: test slices for issue #15

The Claude session `claude-tests-15` (Herdr pane `w3:p3Z`) dispatched you. It is the test coordinator; it reviews your diff before anything is accepted.

You work in your own git worktree (your current directory). It holds branch `issue-15-agents` with the uncommitted implementation applied. `node_modules` and `.vscode-test` are symlinks to the main checkout. Do not reinstall.

## Task

Write the tests of your slice (see your slice brief below this file's path) and nothing else. Production behavior is implemented and accepted by the user; you lock it down.

## Read first

- `CONTEXT.md`: terms **Agent**, **Agent Status**, **Visible Pane Editor**, **Selected Space**, **Session**. Use these terms in test names and fixtures.
- `docs/adr/0010-pane-editor-focus-never-switches-the-active-session.md`.
- `docs/design/issue-15-agents/architecture.md`, especially the **Amendments** section, which wins over earlier text (A1: no programmatic reveal; A3: decoration colors through `VisiblePaneEditorsSource`).
- The code your slice tests (listed in the slice brief) and the existing tests named there as conventions.

## Rules

- **Test observable outcomes through the public seam named in your slice.** No private methods, no collaborator call counts, no assertions on incidental ordering or intermediate steps.
- **Derive expectations from the requirement**, written out as literal values in the test (for example `["agent-b-1", "agent-a-1"]`), not by re-running the production algorithm.
- **Fakes honor the real contract.** For example, `PaneEditorPresence.focused` is always one of `visible`; Agents in a snapshot always reference an existing Space, Herdr Tab, and Pane (the decoder guarantees it). Do not build states production cannot reach.
- **No over-engineering.** The user cares about this. Write the fewest tests that cover the slice's scenarios: prefer one coherent scenario test over many tiny ones. No generic fixture builders, factories with option bags, helper frameworks, or parameterized matrices beyond what the scenarios need. No tests for impossible corner cases. Small local helpers only when used more than once. Match the size and style of the existing test files.
- Write tests and fixtures in English. Follow the repository style (Prettier, ESLint; `forEach` is preferred over `for...of` for listener loops in new code).

## Boundaries

- Change only the files your slice brief lists. If anything else seems to need a change, including production code, do not make it: describe it in your final message.
- If a test exposes a production defect or contradicts the accepted behavior, stop and report it. Do not weaken the test and do not change production code.
- Do not stage, commit, or push.

## Validation

Run `npm run typecheck`, `npm run lint`, `npx prettier --check <your files>`, and your slice's focused test command. All must pass.

## Final message

Put every question in your final message; do not ask interactively. End with a final message containing the complete result:

- files changed;
- each test: its name, the scenario it covers, and what it asserts;
- the commands you ran and their outcomes;
- any defect, contract doubt, or needed change outside your files.
