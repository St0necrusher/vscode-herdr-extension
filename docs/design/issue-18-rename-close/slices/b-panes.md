# Slice B: Panes view — rename and close Panes and Tabs

Read `common.md` in this folder first.

## You own

- `src/features/navigation/panes/PanesModel.ts`
- `src/features/navigation/panes/PanesFeature.ts`
- `src/features/navigation/panes/view/VsCodePanesView.ts`
- `src/features/navigation/panes/view/index.ts`

Report any needed change elsewhere instead of making it. `NavigationFeature`, `package.json` and tests belong to the wiring slice.

## Tasks

### 1. Model: closability (ADR 0005)

- Every Pane row (`PaneNavigationRow`, and so singletons) gets `closable: boolean`: true iff the selected Space has more than one Pane in the snapshot.
- Every group (`PaneNavigationGroup`) gets `closable: boolean`: true iff the selected Space has more than one Herdr Tab in the snapshot.
- Derive both from the snapshot lists already filtered in `getState`. No new state.

### 2. View

- Tree item `contextValue`: `herdr.panes.pane`, `herdr.panes.singleton`, `herdr.panes.group`, each with the suffix `.closable` when the row is closable (for example `herdr.panes.singleton.closable`). The manifest matches these with regexes.
- `PaneTreeItem` also exposes `tabId` (it already exposes `paneId`). Group items already carry `group.tab.id`.
- Rename the context key `herdr.paneCreationEnabled` to `herdr.paneActionsEnabled` (same value: state is `connected`).
- Add an input box method for names, prefilled with the current name and returning `undefined` on cancel. Pane variant accepts empty input. Tab variant rejects input that is empty after trimming through `validateInput`.
- Add error notifications that own their copy, like the existing ones: "Could not rename Pane: …", "Could not rename Tab: …", "Could not close Pane: …", "Could not close Tab: …". Reuse the existing `errorMessage`.

### 3. Feature: four commands

New constructor: `PanesFeature(context, paneTerminalOpening, creation, management: ActiveSessionManagement, paneClosing: PaneTerminalClosing)`.

Register in the same `vscode.Disposable.from(...)`:

- `herdr.renamePane` (argument: `PaneTreeItem`, a Pane or singleton row).
- `herdr.renameTab` (argument: `PanesGroupTreeItem`, or a singleton `PaneTreeItem`, whose Tab is renamed).
- `herdr.closePane` (argument: `PaneTreeItem`).
- `herdr.closeTab` (argument: `PanesGroupTreeItem`).

Each command:

1. Returns unless the model state is `connected`.
2. Finds the row or group in the current model state by id. Returns if it is gone. For close: returns if it is not `closable` (the snapshot may have changed since the menu rendered; ADR 0005 forbids sending the last Pane or Tab).
3. Rename: prompts prefilled with the current name. Pane: the Pane's own `label`, or an empty field when it has none (not the displayed terminal title: accepting the prompt unchanged must not pin the title as a label). Tab: the Tab label. Cancel does nothing. Pane: input that is empty after trimming sends `label: null`; otherwise send the input as typed. Tab: send as typed.
4. Close: no confirmation. Captures the affected Pane ids from that same state (Close Pane: the one Pane; Close Tab: every Pane of the group).
5. Awaits the `management` call. On rejection: shows the matching error notification, and nothing else (no retry, no editor closed).
6. After a successful close only: `paneClosing.closePanes(sessionId, paneIds)`.

The tree updates from the snapshot that `management` already published; do not refresh or patch it locally.

## Done when

All four commands behave as above, the model exposes closability, the view emits the new contextValues and context key, and typecheck is clean in your files.
