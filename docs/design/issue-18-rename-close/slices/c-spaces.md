# Slice C: Spaces view — rename Spaces, Close Space, Close Group

Read `common.md` in this folder first.

## You own

- `src/features/navigation/spaces/SpacesModel.ts`
- `src/features/navigation/spaces/SpacesFeature.ts`
- `src/features/navigation/spaces/view/VsCodeSpacesView.ts`
- `src/features/navigation/spaces/view/index.ts`

Report any needed change elsewhere instead of making it. `NavigationFeature`, `package.json` and tests belong to the wiring slice.

## Tasks

### 1. Model: Worktree Group (ADR 0007, `CONTEXT.md`)

`SpaceNavigationEntry` gets `worktreeGroup?: readonly HerdrSpace[]`: the Spaces that Close Group closes, the primary first and then its linked worktrees. It is present only when the entry is a group primary. Herdr's rule (`architecture.md`, "Herdr facts"):

- the Space has a `worktree` and `worktree.isLinkedWorktree` is false;
- at least one other Space has the same `worktree.repositoryKey` with `isLinkedWorktree` true;
- no other Space with that key has `isLinkedWorktree` false (two unlinked checkouts of one repository are not a group).

Members: the primary plus the linked Spaces with the same key. Derive in `getState`; no new state.

### 2. View

- `SpaceTreeItem.contextValue`: `herdr.space` or `herdr.space.selected` as today, with the suffix `.group` for a group primary (`herdr.space.group`, `herdr.space.selected.group`). Non-group values must stay exactly as today: existing tests match `herdr.space.selected`.
- `SpaceTreeItem` exposes `spaceId`.
- Rename the context key `herdr.spaceCreationEnabled` to `herdr.spaceActionsEnabled` (same value).
- Input box for the Space name: prefilled with the current label; rejects input that is empty after trimming through `validateInput`; `undefined` on cancel.
- Modal confirmation, returns whether the user confirmed:
  - Close Space: a modal warning naming the Space, with a "Close Space" button. Its detail says every Tab and Pane in it will be closed.
  - Close Group: a modal warning titled for the group with a "Close Group" button. Its detail lists the label of every member Space.
- Error notifications owning their copy: "Could not rename Space: …", "Could not close Space: …", "Could not close Group: …".

### 3. Feature: three commands

New constructor: `SpacesFeature(context, operations, creation, paneOpening, management: ActiveSessionManagement, paneClosing: PaneTerminalClosing)`.

Register beside the existing commands:

- `herdr.renameSpace` (argument: `SpaceTreeItem`).
- `herdr.closeSpace` (argument: `SpaceTreeItem`): sends `closeGroup: false`.
- `herdr.closeGroup` (argument: `SpaceTreeItem` of a group primary): sends `closeGroup: true`. Returns if the entry is no longer a group primary.

Each command:

1. Returns unless the model state is `connected`, and finds the entry in the current state by id (returns if gone).
2. Rename: prompts prefilled with the label; cancel does nothing; sends the input as typed.
3. Close: asks the modal first; cancel sends nothing. Captures the affected Pane ids from the snapshot of the same state: every Pane whose `spaceId` is the Space (Close Space) or any member Space (Close Group). Read them from the `NavigationContextSource` you already receive.
4. Awaits the `management` call. On rejection, including Herdr's `workspace_group_close_required`, shows the matching error and nothing else.
5. After a successful close only: `paneClosing.closePanes(sessionId, paneIds)`.

Selected-Space fallback after closing the Selected Space already exists in `NavigationContextModel`; do not add any. The tree updates from the published snapshot; do not patch it locally.

## Done when

All three commands behave as above, the model exposes Worktree Groups, the view emits the new contextValues and context key, and typecheck is clean in your files.
