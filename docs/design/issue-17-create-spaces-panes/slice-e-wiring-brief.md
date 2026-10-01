# Slice E: wiring and review fixes for issue #17

You implement one bounded slice of approved work. Use the `implement-slice` skill conventions.

## Context

- Requirements: `gh issue view 17`.
- Approved design: `docs/design/issue-17-create-spaces-panes/architecture.md`. Read it, but do not edit it.
- Rules: `docs/architecture/code-architecture.md`.
- Branch `feat/issue-17-create-spaces-panes`. The working tree already contains uncommitted slices A–D: socket, Sessions guard, Panes, Spaces. Run `git diff` to see them. Do not commit, push or stage.
- No defensive over-engineering: no rollback scaffolding for programming errors, no handling of impossible states, no flag soup.

## Tasks

### 1. Wiring

- `src/features/navigation/NavigationFeature.ts`:
  - add a dependency `creation: ActiveSessionCreation`;
  - construct `PanesFeature(context, paneTerminalOpening, creation)` first;
  - then construct `SpacesFeature(context, context, creation, panes)`, where `panes` is the `NavigationPaneOpening`.
- Keep disposal in reverse order of construction: dispose Spaces before Panes, the reverse of construction.
- `src/extension/HerdrExtension.ts`: pass `sessionOwner` as `creation`.
- `test/extension/pane-command.test.ts`: update the `PanesFeature` constructor call by adding a creation fake whose three methods return `Promise.reject(new Error("not used"))`. Change nothing else in that test.

### 2. Manifest (`package.json`)

- Add commands:
  - `herdr.createSpace` "Herdr: New Space", icon `$(add)`, `enablement: herdr.spaceCreationEnabled`;
  - `herdr.createPane` "Herdr: New Pane", icon `$(add)`, `enablement: herdr.paneCreationEnabled`;
  - `herdr.splitPaneRight` "Herdr: Split Pane Right", icon `$(split-horizontal)`, `enablement: herdr.paneCreationEnabled`;
  - `herdr.splitPaneDown` "Herdr: Split Pane Down", icon `$(split-vertical)`, `enablement: herdr.paneCreationEnabled`.
- Add menus:
  - `view/title`: `herdr.createSpace` when `view == herdr.spaces`, group `navigation`;
  - `view/title`: `herdr.createPane` when `view == herdr.panes`, group `navigation`;
  - `view/item/context`: both split commands when `view == herdr.panes && viewItem =~ /^herdr\.panes\.(pane|singleton)$/`, group `split@1` and `split@2`;
  - `commandPalette`: hide the two split commands (`"when": "false"`), because they need a Pane row argument.

### 3. Review fixes

**a. Socket: `JsonSocketHerdrSessionConnection.reconcileCreatedPane`.**
- Problem: it loops until a snapshot contains the created Pane id. If Herdr closes that Pane before a snapshot sees it (for example, a shell that exits immediately), the loop keeps requesting snapshots forever.
- Fix: the condition becomes only "a snapshot whose request started after the creation response has been published", that is `latestSnapshotRequestSequence > afterRequestSequence`. Drop the pane-containment check and the `paneId` parameter.
- If the Pane is already gone, the consumer's `openPane` fails its lookup and shows the existing error. That is the intended outcome.

**b. `PanesFeature` constructor.**
- Remove the inner `registrations` try/catch rollback scaffolding. Register the four commands with a single `vscode.Disposable.from(...)`, as the architecture rules say: duplicate registration fails activation loudly.
- Import `PaneTreeItem` through `./view` by exporting it from `panes/view/index.ts`, not from `./view/VsCodePanesView`.

**c. `SpacesFeature`.**
- The `herdr.createSpace` handler wraps `createSpace()` in a second try/catch that shows "Could not create Space" for any error, including errors from folder choice. Remove that outer catch: `createSpace()` already handles its own failures.
- Move error copy into the View, following the `VsCodePanesView` pattern. Replace `showErrorMessage(text)` calls from the Feature with View methods `showSpaceCreationError(error)` and `showCreatedSpaceOpenError(error)`, which own the text.
- `chooseSpaceFolder` keeps its own "Open a folder…" error inside the View.

## Done when

- All tasks above are implemented, with no other changes.
- `npm run typecheck`, `npm run lint` and `npm run format:check` pass. If any check fails, report the output.
- Do not run or write tests.

## Report

End with a final message containing the changed files, what you did for each task, the check results, and any deviation or open question.
