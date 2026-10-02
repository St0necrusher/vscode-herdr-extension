# Common brief for issue #18 workers

You implement one bounded slice of approved work. Follow the `implement-slice` skill (`.claude/skills/implement-slice/SKILL.md`).

## Context

- Coordinator: Claude session `claude-impl-18` (Herdr pane `w3:p31`).
- Requirements: `gh issue view 18`.
- Approved design: `docs/design/issue-18-rename-close/architecture.md`. Read it; do not edit it. Also ADRs `docs/adr/0005`–`0007` and `CONTEXT.md` (Worktree Group).
- Pattern to mirror: the #17 creation feature. Its design is `docs/design/issue-17-create-spaces-panes/architecture.md`; its code is commit `3c984c6` (`git show 3c984c6`).
- Rules: `docs/architecture/code-architecture.md`.
- Branch `feat/18-rename-close`. Do not commit, push or stage.

## Contracts already written (do not change them)

- `src/capabilities/sessions/management.ts`: `ActiveSessionManagement` and its request types.
- `src/capabilities/sessions/connection.ts`: `HerdrSessionConnection` gained `renamePane(paneId, label: string | null)`, `renameTab(tabId, label)`, `renameSpace(spaceId, label)`, `closePane(paneId)`, `closeTab(tabId)`, `closeSpace(spaceId, closeGroup)`, all `Promise<void>`.
- `src/capabilities/terminalSurfaces/paneTerminalClosing.ts`: `PaneTerminalClosing.closePanes(sessionId, paneIds)`, already implemented by `PaneTerminalSurfaceManager`.

If a contract is wrong for your slice, report it instead of changing it.

## Parallel work

Other workers edit other files in this same working tree at the same time. Type errors in files you do not own are expected until the wiring slice runs; ignore them. Never edit, revert or format files you do not own.

## Rules

- Write the minimum that satisfies your slice. No defensive over-engineering: no flag soup, no handling of impossible states, no rollback scaffolding, no retries. Let programming errors fail loudly.
- Do not write or change tests, fixtures or test helpers. Do not bend production code to suit tests.
- Code and comments in English. Match the surrounding code's style, naming and comment density (sparse).
- Put every question in your final message; do not stop on an interactive prompt.

## Validation

Run `npm run typecheck` and report errors in your own files only (errors elsewhere are expected). Run `npx prettier --check <your files>` and `npx eslint <your files>`. Do not run the test suites.

## Report

End with a final message containing: changed files; each task mapped to where it is implemented; check results; deviations from this brief or the architecture; open questions.
