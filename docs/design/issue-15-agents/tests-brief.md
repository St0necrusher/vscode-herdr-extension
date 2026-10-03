# Brief: tests for issue #15 (Track and navigate detected Agents)

The Claude session `vscode-herdr-extension-eb` (Herdr pane `w3:p27`) dispatched you. You are the **test coordinator**. The user (they/them) is in your tab. Chat with them in Russian. Write tests, code, and docs in English.

## Goal

Agree a bounded list of test scenarios and an execution plan with the user, then write exactly those tests.

**Present your plan first. Write no tests until the user explicitly approves it.** Approval of the architecture or the implementation does not authorize test authoring.

You are done when:

- every approved scenario is implemented through its agreed seam;
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, and `npm run test:extension` all pass;
- the user accepts the result in your tab.

## Workflow

Follow steps 1–4 of `.claude/skills/tests/SKILL.md`, together with `.claude/skills/testing-scenarios.md` (its after-implementation branch) and `.claude/skills/delegating-slices.md`.

You choose the scenarios and propose them; the user decides. You may write the tests yourself or split them into slices for workers, whichever the user agrees to. If you use workers, give each one its own test file and its own worktree, because the extension suite rebuilds `dist/`.

## Read first

- `gh issue view 15`: the requirements. Acceptance criterion 5 is already narrowed: no programmatic row reveal or selection.
- `docs/design/issue-15-agents/architecture.md`: the approved design.
  - The **Amendments** section supersedes earlier text where they conflict: A1 (reveal dropped), A2 (`navigation/shared/`), A3 (decoration color, `VisiblePaneEditorsSource`), A4, A5.
  - Read `progress.md` and `review-spec.md` as well, and append your progress to `progress.md`.
  - Do not edit the other design files. Propose any changes to them in your report.
- `CONTEXT.md` (Agent, Agent Status, Visible Pane Editor), ADR 0004, and ADR 0010. Use domain terms in test names and fixtures.
- The implementation, uncommitted on branch `issue-15-agents`. Read it with `git status` and `git diff`. New files:
  - `src/capabilities/terminalSurfaces/paneEditorPresence.ts`
  - `src/features/navigation/agents/`
  - `src/features/navigation/shared/`
- Existing conventions you can reuse:
  - `src/features/navigation/NavigationContextModel.test.ts`, `PanesModel.test.ts`, `SpacesModel.test.ts`: host-neutral model tests with fake sources.
  - `test/extension/pane-command.test.ts`, `creation-commands.test.ts`: a fake projection plus recording opening, driven through VS Code commands.
  - `test/extension/pane-editors.test.ts`: the real `PaneTerminalSurfaceManager` with fake Pane clients, in real editor groups.
  - `esbuild.mjs`: register new extension test files in its entry-point list.

## User's review decisions

- The user checked the implementation live, from a VSIX against a real Herdr, and accepted the behavior.
- **Advisory review.** Its minor standards findings S1–S3 are accepted as they are and will not be fixed. Spec risk R1 is accepted as pre-existing, with no issue and no test: during the gap between `pane.moved` and the next snapshot, a click opens a Pane by its old ID.
- `engines.vscode` is now `^1.134.0`.
- Do not touch production code.

## Preliminary scenario plan (reconcile it; do not just copy it)

Critical candidates:

- **C1 — Agent rows.** `AgentsModel` keeps Herdr order across Spaces, applies the label chain `name → displayAgent → agent`, and provides the `Space · Pane` naming inputs.
- **C2 — Focus drives the Selected Space.** Through `NavigationContextModel` (`NavigationContextSource` + `VisiblePaneEditorsSource`) with fake projection and fake presence:
  - a change of the focused Pane Editor of the active Session sets the Selected Space;
  - another Session's Pane Editor, or a file editor (no focused Pane Editor), changes nothing;
  - a Space the user picks is not overridden while focus stays the same.
- **C3 — Visible Pane Editor marks.** The decoration provider marks the Pane, Agent, and Space row URIs for the active Session's Visible Pane Editors, and fires changes when they change. This provider is a VS Code class, so pick the right level.
- **C4 — Stale and unavailable.** Stale keeps the Agent rows; unavailable is empty.
- **C5 — `herdr.openAgentPane`.** It selects the Agent's Space and opens the Pane Editor. A second call reuses the same editor. Extension level.
- **C6 — Pane Editor presence.** `PaneTerminalSurfaceManager` reports `visible` and `focused` correctly when tabs are activated across two editor groups, and when tabs are closed. Extension level.

Optional candidates:

- `openPane` focuses a Visible Pane Editor that sits in an inactive group (decision 1).
- A Pane move keeps the Agent row and the single Pane Editor.

Excluded:

- icons, colors, tooltip copy, and how VS Code renders decorations;
- Agent decoding in the snapshot (already covered);
- Herdr status semantics.

## Boundaries

- Write only the approved tests and their fixtures, and register new extension test files in `esbuild.mjs`.
- Do not change production code. If a test exposes a production defect or contradicts the approved behavior, stop and report it to the user.
- Do not stage, commit, push, open a PR, or close the issue unless the user asks you to in your tab.

## Final report

Send **one** message with `SendMessage` to `vscode-herdr-extension-eb`, then stop. Send it when the user accepts the work, or when you are blocked. Send no intermediate updates. Include:

- the tests you added, the requirement or risk each one protects, and its seam and level;
- the approved scenarios, and the optional ones you left out;
- the commands you ran and their outcomes;
- any production defects or limitations you found;
- how sensitive the tests are to implementation changes.
