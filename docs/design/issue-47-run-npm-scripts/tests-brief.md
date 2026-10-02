# Brief: tests for issue #47 (Run package.json scripts in Herdr)

You were dispatched by the Claude session `vscode-herdr-extension-31` (Herdr pane `w3:p27`). You are the **test coordinator**. The user (they/them) is in your tab. Chat with them in Russian. Tests, code, and docs are written in English.

## Goal

Agree a bounded list of test scenarios and an execution plan with the user, then write exactly those tests.

**Present your plan first and write no tests until the user explicitly approves it.** Approval of the architecture or the implementation does not authorize test authoring.

You are done when:

- every approved scenario is implemented through its agreed seam;
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` and `npm run test:extension` all pass;
- the user accepts the result in your tab.

## Workflow

Follow `.claude/skills/tests/SKILL.md` steps 1–4, together with `.claude/skills/testing-scenarios.md` (its after-implementation branch) and `.claude/skills/delegating-slices.md`.

You choose the scenarios and propose them, and the user decides. You may write the tests yourself or split them into slices for workers, whichever the user agrees to. If you use workers, give each one its own test file and its own worktree, because the extension suite rebuilds `dist/`.

## Read first

- `gh issue view 47` (the requirements), plus the "Run Script in Herdr" part of `gh issue view 39`, including its Testing Decisions.
- `docs/design/issue-47-run-npm-scripts/architecture.md`: the approved design and the "Amendments after implementation" section (A1, A2, D1, error copy). Read `progress.md` as well and append your progress to it. Do not edit the other design files; propose any changes to them in your report.
- `CONTEXT.md` and ADR 0008. Use domain terms in test names and fixtures.
- The implementation, which is uncommitted on branch `issue-47-run-npm-scripts`. Read it with `git status` and `git diff`. New files are in `src/features/navigation/scripts/`.
- Existing conventions you can reuse:
  - `test/extension/creation-commands.test.ts`: a fake projection, recording creation, and recording opening, driven through VS Code commands.
  - `test/integration/herdr-socket/JsonSocketHerdrSessionConnection.test.ts`: the fake-socket harness, with existing `tab.create` and `pane.split` cases.
  - `.vscode-test.mjs`: the test workspace is `test/fixtures/workspace`. Built-in extensions, including npm, are enabled.
  - `esbuild.mjs`: new extension test files must be registered in its entry-point list.

## User's review decisions

- The user checked the implementation live, from a VSIX against a real Herdr, and accepted the behavior.
- The advisory review found no spec defects. It found one minor standards finding: some compound conditions are not named as `const`s. That finding does not change behavior and is handled separately. Do not touch production code for it.

## Preliminary scenario plan from the design stage (reconcile it; do not just copy it)

Critical candidates:

- **C1 — view entry point.** An NpmScript-shaped element produces a `createPane` request with the Selected Space, `cwd` set to the `package.json` folder, and `label` set to the script name. It produces a `runCommand` with the command the real npm extension resolves from a fixture lockfile. The Pane Editor opens for the created Pane.
- **C2 — hover visibility.** The "Run in Herdr" link appears while the Session is connected and is absent while it is stale. Exercise it through `vscode.executeHoverProvider`.
- **C3 — hover link.** Running the hover link's command follows the same flow.
- **C4 — run failure.** When `runCommand` fails, no Pane Editor opens and nothing closes the Tab.
- **C5 — refused runs.** With no Selected Space, or with a malformed view element, no creation request is sent.
- **C6 — socket contract.** `tab.create` carries `cwd`, `label`, and `focus: false`, while New Pane's parameters stay unchanged. `runCommand` sends `pane.send_input {pane_id, text, keys: ["Enter"]}` and resolves on `ok`. Check the real result types with `herdr api schema --json`.
- **C7 — editor menu (A1).** `herdr.runNpmScriptAtCursor` runs the script when the cursor is on its value.

Optional candidates:

- Pure command-line building: the `node` runner, and quoting of names with spaces or quotes.
- Runner fallback.

Excluded:

- The npm extension's own logic, the evaluation of `when` and `enablement`, Herdr executing the command, and notification text.

## Boundaries

- Write only the approved tests, test fixtures (for example a `package.json` and a lockfile under `test/fixtures/workspace`), and register them in `esbuild.mjs`.
- Do not change production code. If a test exposes a production defect or contradicts the approved behavior, stop and report it to the user.
- Do not stage, commit, push, open a PR, or close the issue unless the user asks you to in your tab.

## Final report

When the user accepts the work, or you are blocked, send **one** message with `SendMessage` to `vscode-herdr-extension-31` and then stop. Send no intermediate updates. Include:

- the tests you added, the requirement or risk each one protects, and its seam and level;
- the approved scenarios and the optional ones you left out;
- the commands you ran and their outcomes;
- any production defects or limitations you found;
- any sensitivity of the tests to implementation changes.
