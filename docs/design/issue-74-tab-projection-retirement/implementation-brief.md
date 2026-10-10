# Implementation brief: #74 a navigation click retires the Tab Projection

from: claude design session (claude, Herdr pane w3:p6T)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/reports/coordinator-final.md
skills: delegating-slices

You are the **coordinator** of issue [#74](https://github.com/St0necrusher/vscode-herdr-extension/issues/74) in `/Users/kuzmichev/dev/vscode-herdr-extension`. The task directory (TD) is `docs/design/issue-74-tab-projection-retirement/`. The user works with you directly in this tab.

## Sources

- `TD/architecture.md`: the approved design, authoritative. It includes the architect's readiness answers.
- `TD/map.md`: what the user asked for, box by box (stage: implementation).
- `TD/progress.md`: decisions so far, the architect's name and pane.
- `docs/adr/0018-navigation-click-retires-the-tab-projection.md`, `docs/adr/0017-herdr-tab-opens-as-the-whole-editor-grid.md`, `CONTEXT.md` (Tab Projection).
- `docs/architecture/ARCHITECTURE.md`, `docs/architecture/IMPLEMENTATION.md`.
- A prior common worker brief to adapt: `docs/design/issue-19-tab-layout-projection/briefs/common.md` (update the architect's name, pane, and TD).

The design is decided. Do not reopen it; a contradiction between the design and the code goes to the architect, and behaviour the user sees goes to the user.

## Workflow

Follow `build` §3 (from "Hand off to the coordinator") through §5 and the `delegating-slices` skill. Additions:

- Present your execution plan to the user and start only after their explicit approval. The change is small and lives mostly in one file (`src/modules/pane-editors/PaneTerminalSurfaceManager.ts`), so a single production slice is the expected cut; justify any split.
- Shadow review: review every worker diff yourself as well as through the reviewer, and record what each found in `TD/progress.md`. Look for production code bent to suit tests, weakened assertions, defensive branches for unreachable states, and flag-style state.
- Trust a worker's reported checks; do not rerun them unless your own integration changed something.
- Architect: `astra-arch-74`, Herdr pane w3:p7H. Workers ask it directly per the `architect` skill.

## Tests

This phase writes no new tests; test authoring is a later phase after human review. Two existing extension tests in `test/extension/tab-layout.test.ts` assert the old behaviour ("switches from real Tab 13 to Tab 12 while retaining the other Tab's Pane Editors behind it" and "returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13"). They are expected to fail after the change. Workers must not edit them; report them as existing-test conflicts. Any other failing test is a defect.

## Boundaries

- Branch `feat/74-retire-tab-projection` in the main checkout (already created; it carries the uncommitted `CONTEXT.md`, ADR 0018 and TD files, which belong to this work). Use a worktree only if parallel workers need one.
- Commit accepted slices on this branch only with the user's approval in your execution plan. No push, no PR, no issue closure.
- Architecture artifacts (`TD/architecture.md`, `TD/map.md`, ADRs, `CONTEXT.md`) are parent-only: you and the workers do not edit them. Proposed amendments go in your final report.

## Final report

Talk with the user in your tab as needed; send nothing to the dispatching session until the end. When the work is done, write your complete report to the reply-to path, in the shape of `build` §5: implementation summary and changed contracts, acceptance table by map box, validation commands and outcomes, triaged `final-review` findings, existing-test conflicts, deviations and proposed amendments, manual check list by map box, and the updated verification plan (`testing-scenarios`). A summary of at most 20 lines first. The last line must be exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
