# Slice S3: Agent navigation, Visible Pane Editor marks, Pane Editor presence (C5 + C3b, C6, O1)

Read `docs/design/issue-15-agents/tests-workers-brief.md` first.

**Owned files:** new `test/extension/agents-navigation.test.ts`; `esbuild.mjs`, only to add that file to the extension test entry-point list.

**Level:** VS Code extension test (mocha `suite`/`test`, real editor groups), run by `npm run test:extension`.

**Harness.** Build in this file:

- the real `PaneTerminalSurfaceManager` (with `PaneEditorSelectionModel`, `PaneEditorFocusTracker`, `VsCodePaneTerminalSurface`, and fake Pane clients), copied in reduced form from `test/extension/pane-editors.test.ts`;
- the real `NavigationFeature` (`src/features/navigation/NavigationFeature.ts`) given:
  - a fake `ActiveSessionProjectionSource` with one connected Session: two Spaces, Panes in both, and Agents in both;
  - the manager as both `paneTerminalOpening` and `paneEditorPresence`;
  - unused stubs for the rest, as in `test/extension/run-npm-script.test.ts` and `creation-commands.test.ts`.
- Capture the tree data providers by intercepting `vscode.window.createTreeView`, prefix command IDs by intercepting `vscode.commands.registerCommand`, and capture the decoration provider by intercepting `vscode.window.registerFileDecorationProvider`. Restore everything in `finally`. The activated extension already registers the real commands, which is why the conventions prefix them.

The pane-editors test explains window-focus and client details; reuse its `waitFor` style for async editor changes.

**Note on the manager's open requests:** `PanesFeature.openPane(paneId)` builds the request from the snapshot. The Pane Editor's tab label is the Pane name (spaces replaced with ` `); see how pane-editors.test.ts locates tabs.

## Scenarios

- **C5 + C3b: selecting an Agent (issue #15 AC 1 description, AC 3, AC 4, AC 7, AC 9).** One coherent test:
  - The Agents tree row of an Agent in the non-selected Space has the description `<Space label> · <Pane name>` and the command `herdr.openAgentPane` with the Pane ID.
  - Executing the (prefixed) `herdr.openAgentPane` with that Pane ID makes its Space the Selected Space (observable in the Panes tree, which then lists that Space's Panes) and opens exactly one Pane Editor tab for the Pane.
  - The decoration provider decorates the `resourceUri` of that Pane's row in the Panes tree, its Agent row, and its Space row in the Spaces tree, and fires `onDidChangeFileDecorations`. Rows of other Panes are not decorated.
  - Executing the command again creates no second tab and no second terminal.
  - Showing a text document in the same editor group hides the Pane Editor, and the marks go away.
- **C6: Pane Editor presence (contract of `PaneEditorPresenceSource`).** Through `getPaneEditorPresence()` of the real manager:
  - Two Pane Editors in two editor groups are both `visible`; `focused` is the one in the active group.
  - Focusing the other group (`workbench.action.focusPreviousGroup` / `focusNextGroup`) moves `focused` and keeps both visible.
  - A text document shown over one of them removes it from `visible`, and `focused` is absent while the text document is the active editor.
  - Closing the remaining Pane Editor's tab removes it from `visible`.
- **O1: opening a Visible Pane Editor of an inactive group focuses it (architecture decision 1).** With two Pane Editors visible in two groups, `openPane` for the one in the inactive group makes it the active tab of the active group, without a new tab or terminal. This may live in the C6 test if it stays readable.

Start each test from `workbench.action.closeAllEditors` and close all editors afterwards, as pane-editors.test.ts does.

**Focused command:** `npm run test:extension` (it rebuilds `dist/` and runs every extension test; all must pass).
