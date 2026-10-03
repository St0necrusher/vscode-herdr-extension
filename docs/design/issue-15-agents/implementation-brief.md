# Implementation brief — issue #15 (Track and navigate detected Agents)

You are the **implementation coordinator** for issue #15. The Claude session `vscode-herdr-extension-eb` (Herdr pane `w3:p27`) dispatched you. The user (they/them) talks to you directly in your tab and settles any remaining details with you there. Chat with the user in Russian. Write code, docs, and commit messages in English.

## Read first

- `CLAUDE.md`, `CONTEXT.md`, and `docs/architecture/code-architecture.md`. The last one is the architecture authority.
- **Approved design:** `docs/design/issue-15-agents/architecture.md`. It covers:
  - scope and the facts it relies on;
  - modules, the domain model, data flow, public seams, and the expected file structure;
  - accepted decisions 1–6;
  - the preliminary verification plan.
- Requirements: `gh issue view 15`. Background: parent spec `gh issue view 9`, ADR 0004 and ADR 0010.
- Code to read before changing it:
  - Navigation: `src/features/navigation/` (context model, Spaces, Panes, Scripts).
  - Pane Editors: `src/infrastructure/pane-editors/PaneTerminalSurfaceManager.ts`.
  - Composition: `src/extension/HerdrExtension.ts`.
- User preferences. No defensive over-engineering:
  - no flag soup;
  - no checks for states that cannot happen;
  - no speculative fallbacks beyond what the design names;
  - named discriminated-union states;
  - one owner per fact.

## Decisions already made

Do not reopen these unless the user does.

1. **`PaneTerminalSurfaceManager.openPane` focuses a Visible Pane Editor that sits in an inactive group.**
   - It is a no-op only when the editor is the active tab of the *active* group.
   - Otherwise it calls `reveal()`.
   - This also applies to `herdr.openPane`.
2. **Reveal works like the VS Code Explorer.**
   - The Panes View and the Agents View call `reveal(row, { select: true, focus: false })` only while `treeView.visible` is true. They call it when the focused Pane Editor changes.
   - When a View becomes visible (`onDidChangeVisibility`), it reveals the current focused row once.
   - Reason: `TreeView.reveal` always opens its view first, and that would switch the sidebar.
   - The Panes View needs `getParent`.
3. **The Visible mark is a FileDecoration badge.**
   - A row of a Visible Pane Editor gets a `resourceUri` with the scheme `herdr-visible-pane-editor:`. Other rows get no `resourceUri`.
   - One stateless `FileDecorationProvider` decorates every URI of that scheme with badge `●` and tooltip "Visible in an editor".
   - The provider fires no change events: re-rendering the row is the only update.
   - The accessibility label also says that the Pane Editor is visible.
4. **Space rows keep Herdr's aggregate `agentStatus`.**
5. **Agent label** is `name ?? displayAgent ?? agent`.
   - There is no Pane-name fallback: Herdr lists an Agent only when it has `name` or `agent`.
   - End the chain with an empty string only to satisfy the type.
6. **Command `herdr.openAgentPane(paneId: string)`.**
   - Hidden from the Command Palette. It is the row command of Agent rows.
   - `AgentsFeature` registers it.
   - It selects the Pane's Space, then calls `NavigationPaneOpening.openPane`.
   - It works in connected and stale states, like `herdr.openPane`.
   - It sends nothing to Herdr about the Agent.

Also settled:

- **New capability.** `PaneEditorPresenceSource` goes in `src/capabilities/terminalSurfaces/`.
  - `PaneTerminalSurfaceManager` implements it directly.
  - It is derived from the manager's Tab bindings.
  - The manager also subscribes to `tabGroups.onDidChangeTabGroups`.
  - The manager publishes only when the value changes.
- **`NavigationContextModel`** consumes the new capability.
  - A *change* of the focused Pane Editor of the active Session sets the Selected Space.
  - Other Sessions and file editors change nothing (ADR 0010).
  - The context publishes `paneEditors` for the active Session.
- **`paneName`** moves to `src/features/navigation/paneName.ts`.
- **Agents** is a Navigation child under `src/features/navigation/agents/`. Its view id is `herdr.agents` ("Agents"), placed after Panes.

## Workflow

1. Work on the existing branch `issue-15-agents`. It is already created from `main`. It carries the uncommitted `CONTEXT.md` terms and `docs/adr/0010-…`, which belong to this issue. Keep both.
2. Before you edit any file, present your execution plan to the user and get explicit approval. Follow `.claude/skills/delegating-slices.md`:
   - You can do the work yourself, or cut it into slices for `gpt-6-luna` workers (`max` thinking).
   - If you fan out, write the shared seams yourself first: the capability, the context state type, and any stubs.
   - Wire the manifest and composition last.
3. Review every worker diff personally before you accept it. This applies only if you use workers.
4. Run `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test`. Run `npm run test:extension` once at the end.
5. **Tests.** Do not write new tests unless the user explicitly approves the scenarios with you. Test authoring is a separate phase. Keep the existing tests passing. Minimal compile fixes in existing tests and fakes are allowed, for example when a widened constructor or context state type breaks them.

## Boundaries

- Change only the files in the design's "Expected file structure". Two exceptions are allowed:
  - minimal compile fixes in existing tests and fakes;
  - `esbuild.mjs` or the lint config, only if the new files require it. Say so in your report.
- **Do not edit** `docs/design/issue-15-agents/architecture.md` or the other design artifacts. Propose amendments in your report. Ask the user about anything that changes behavior, public contracts, or module boundaries.
- Do not commit, push, open a PR, or close the issue unless the user explicitly asks you to in your tab.

## Final report

Send **one** message with `SendMessage` to `vscode-herdr-extension-eb`, then stop. Send it when the user says the work is ready, or when you are blocked. Send no intermediate updates. Include:

- the branch, and the changed files with their responsibilities;
- how each acceptance criterion of #15 is met, or why it is not;
- deviations from the approved design and the decisions agreed with the user, written as amendments for me to record;
- the validation commands and their results, including anything you did not run and why;
- open questions and risks.
