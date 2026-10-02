# Brief: implement issue #18 (Rename and close Panes, Tabs, and Spaces)

You were dispatched by the Claude session `vscode-herdr-extension-4c` (Herdr pane `w3:p27`). The user is in your tab and will drive implementation with you. Your job is to coordinate it.

## Goal

Implement GitHub issue #18 as designed in the approved architecture.

You are done when:
- every acceptance criterion in #18 is implemented;
- the result is reconciled against the architecture;
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` pass;
- the user accepts the result in your tab.

## Read first

- `gh issue view 18`: requirements. They were revised on 2026-10-01 after a grilling session.
- `docs/design/issue-18-rename-close/architecture.md`: the design. Decisions D1–D4 are accepted, and the user approved the design and authorized implementation on 2026-10-01. Also read `progress.md` in the same folder and append to it as you go.
- ADRs `docs/adr/0005`–`0007`, and `CONTEXT.md` (in particular Worktree Group).
- `docs/design/issue-17-create-spaces-panes/architecture.md`: the creation feature this one mirrors. Reuse its mechanisms: the Sessions guard, `requestOnce`, and reconcile-before-resolve.
- `docs/architecture/code-architecture.md`: the canonical architecture rules.
- `.claude/skills/build/SKILL.md`, sections 3–5, and `.claude/skills/delegating-slices.md`: the workflow you are continuing. Steps 1–2 are already done.

## Decisions already made (do not reopen without the user)

Everything in `architecture.md`. In brief:
- **New capabilities:** `ActiveSessionManagement` (six operations) and `PaneTerminalClosing.closePanes(sessionId, paneIds)`.
- **Close Pane** is hidden when the Space has exactly one Pane. **Close Tab** is hidden when the Space has exactly one Tab.
- **Close Space** is preceded by a modal confirmation. **Close Group** applies to the primary of a Worktree Group, uses Herdr's rule, lists the member Spaces in the modal, and sends `close_group: true`.
- After a successful close, the Pane Editors of exactly the affected Panes are closed. Those Panes are computed by Navigation from the snapshot at click time. Remote closes keep the placeholder.
- **Rename Pane:** an empty input sends `label: null`. **Rename Tab / Rename Space:** reject empty input.
- **Failures** show an error notification only: no retry, no reconciliation, no editor closed.
- **Menus:** an inline `×` and context-menu entries, gated by `config.herdr.views.showInlineClose` (new setting, default `true`; it gates only the inline `×`). All new commands are hidden from the Command Palette.
- **Context keys:** `herdr.paneCreationEnabled` becomes `herdr.paneActionsEnabled`, and `herdr.spaceCreationEnabled` becomes `herdr.spaceActionsEnabled`. Update existing tests that reference the old names, without weakening them.

## Workflow

- Implement through `gpt-6-luna` workers with max thinking, using the `multi-agent-delegate` skill (kind `pi`) and the `implement-slice` skill brief conventions. Personally review every worker diff and bounce it until it is fixed.
- **Contract-first:** before dispatching, write the shared seams yourself:
  - `capabilities/sessions/management.ts`;
  - `capabilities/terminalSurfaces/paneTerminalClosing.ts`;
  - the `HerdrSessionConnection` additions;
  - minimal stubs that keep everything compiling.
- **Suggested slices** (adjust with the user):
  1. Socket requests and the Sessions implementation of `ActiveSessionManagement`.
  2. `PaneTerminalSurfaceManager.closePanes`.
  3. Panes: model closability, feature commands, view.
  4. Spaces: model Worktree Group, feature commands, view.
  5. Wiring, run last: `NavigationFeature`, `HerdrExtension`, `package.json`.

  Slices 1–4 own disjoint files and can run in parallel after the contracts exist. Type errors in other workers' files are expected meanwhile.
- Run only typecheck after each slice. Run the full checks at the end.
- Do not author new tests; the user will discuss the test plan (preliminary list in `architecture.md`) separately after implementation. Do not weaken existing tests.
- Chat with the user in Russian. Write code, docs, commits and tickets in English.
- No defensive over-engineering: no flag soup, no handling of impossible corner cases, no rollback scaffolding. Check workers' output for this, and for production code bent to suit tests.
- You own `architecture.md` edits. Record accepted deviations only after the user approves them.

## Boundaries

- Work on the current branch `feat/18-rename-close`. The branch already holds uncommitted `CONTEXT.md` and `docs/adr/0005`–`0007` from the design session; keep them and include them in the first commit. Do not commit, push, open PRs or close issues unless the user tells you to in your tab.
- Touch only files needed for #18 and the task folder `docs/design/issue-18-rename-close/`.

## Output

Report only once, when implementation is complete and the user has accepted it. Send no intermediate updates; resolve questions with the user in your tab. The only exception is an architecture amendment that needs the design owner. When done, send the complete result with SendMessage to `vscode-herdr-extension-4c`, then stop. Include:
- the changed files and the public contracts that changed;
- an acceptance table for the #18 criteria;
- the validation commands and their outcomes;
- any architecture deviations that were accepted;
- what remains open, including the test-plan discussion.
