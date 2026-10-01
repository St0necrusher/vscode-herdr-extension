# Brief: implement issue #17 (Create server-owned Spaces and Panes)

You were dispatched by the Claude session `vscode-herdr-extension-62` (Herdr pane `w3:p27`). The user is in your tab and will drive implementation with you. Your job is to coordinate it.

## Goal

Implement GitHub issue #17 as designed in the approved architecture.

You are done when:
- every acceptance criterion in #17 is implemented;
- the result is reconciled against the architecture;
- `npm run typecheck`, `npm run lint` and `npm test` pass;
- the user accepts the result in your tab.

## Read first

- `gh issue view 17`: requirements. They were revised on 2026-10-01 after a grilling session. Native VS Code splits on Pane Editors are excluded (#41).
- `docs/design/issue-17-create-spaces-panes/architecture.md`: the design. Decisions D1–D4 are accepted, and the user approved the design and authorized implementation. Also read `progress.md` in the same folder and append to it as you go.
- `docs/architecture/code-architecture.md`: the canonical architecture rules.
- `CONTEXT.md`: domain terms.
- `.claude/skills/build/SKILL.md`, sections 3–5: the workflow you are continuing. Steps 1–2 (grounding and design) are already done.

## Decisions already made (do not reopen without the user)

- **D1:** create requests go over the Sessions-owned socket connection (`JsonSocketHerdrSessionConnection`), not the CLI:
  - `workspace.create {cwd, focus:false}` returns `workspace_created {workspace, tab, root_pane}`;
  - `tab.create {workspace_id, focus:false}` returns `tab_created {tab, root_pane}`;
  - `pane.split {target_pane_id, direction, focus:false}` returns `pane_info {pane}`.
  Verify the shapes with `herdr api schema --json`.
- **D2:** a creation promise resolves only after the projection snapshot that contains the result has been published.
- **D3:** `NavigationPaneOpening.openPane(paneId)` looks up the Pane in the whole Session snapshot, not only in the Selected Space rows.
- **D4:** View-set context keys `herdr.spaceCreationEnabled` (connected) and `herdr.paneCreationEnabled` (connected and a Selected Space exists) drive `enablement`. Split uses the pane key.
- **Product decisions:**
  - New Space uses the VS Code folder. A single folder is used directly. In a multi-root workspace, show a QuickPick with the active editor's folder first; Esc cancels. With no folder open, show an error and create nothing.
  - No label prompt.
  - After New Space, select the new Space and open its root Pane.
  - New Pane and Split use Herdr's default cwd.
  - The Split result opens like Open Pane.
  - Failures show only an error notification, with no rollback.
  - No Agent launch.

## Workflow

- Implement through `gpt-6-luna` workers with max thinking, using the `multi-agent-delegate` skill (kind `pi`) and the `implement-slice` skill brief conventions. You review each slice.
- Planned slices, run sequentially:
  1. Socket requests, protocol parsing, the `ActiveSessionCreation` capability, and the Sessions guard.
  2. The Navigation features, Views, context keys, `package.json` and `HerdrExtension` wiring.
- Run only typecheck after each slice. Run the full checks at the end.
- Do not author new tests. The user will discuss the test plan separately after implementation. Do not weaken existing tests.
- Chat with the user in Russian. Write code, docs, commits and tickets in English.
- No defensive over-engineering: no flag soup, no handling of impossible corner cases. Check delegates' output for this.
- You own `architecture.md` edits. Record accepted deviations only after the user approves them.

## Boundaries

- Work on the current branch `feat/issue-17-create-spaces-panes`, created from `main`. Do not commit, push, open PRs or close issues unless the user tells you to in your tab.
- Touch only files needed for #17 and the task folder `docs/design/issue-17-create-spaces-panes/`.

## Output

Report only once, when implementation is complete and the user has accepted it. Send no intermediate updates. When done, send the complete result with SendMessage to `vscode-herdr-extension-62`, then stop. Include:
- the changed files and the public contracts that changed;
- an acceptance table for the #17 criteria;
- the validation commands and their outcomes;
- any architecture deviations that were accepted;
- what remains open, including the test-plan discussion.
