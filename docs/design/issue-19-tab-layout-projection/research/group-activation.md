# opus-research-1: activating a specific editor group without cycling

## Summary

- **Recommendation: one directional hop.** For step 3 run `workbench.action.focusLeftGroupWithoutWrap` when the split is `right`, or `workbench.action.focusAboveGroupWithoutWrap` when it is `down`. Then wait until `tabGroups.activeTabGroup.activeTab` is the anchor's tab. The hop is exact by construction, with no limit on group count and no lookup by index.
- **Why it is exact:** `project(node)` always ends with the group of `firstLeaf(node)` active (proof by induction below). After `project(second)`, the active group therefore sits on the edge of `second`'s region that faces `first`. At that moment `first`'s region is still exactly one group, the anchor's. So the only neighbour in that direction is the anchor group, and VS Code's MRU tie-break (`editorPart.ts:375-383`) has nothing to break.
- **Why it doesn't need OS focus:** every focus-group command ends in `IEditorGroupView.focus()`. That method fires `_onDidFocus` synchronously (`editorGroupView.ts:1114-1125`), and `EditorPart` handles it with `doSetGroupActive` (`editorPart.ts:707-708`). Activation does not wait for a DOM focus event. `Terminal.show` and `terminal.focus` differ: they go through `EditorActivation.PRESERVE` or xterm DOM focus.
- **The prototype proved it without OS focus:** VS Code 1.141.0 extension host, `window.state.focused=false` in every test. 5 layouts × 2 strategies = 10/10 passing. Each run checked the result against `vscode.getEditorLayout` and the per-`viewColumn` active tab labels, inside a region that had file groups on both sides (`file | region | file`). Layouts: `A/B | C`, 2×2 as columns, 2×2 as rows, a 6-leaf nested tree, and a right chain.
- **Ranked alternatives:**
  1. *(recommended)* Directional hop, `focus{Left,Above}GroupWithoutWrap`.
  2. `workbench.action.focus{First..Eighth}EditorGroup` with index `= anchorTab.group.viewColumn - 1`. Also exact and also proven 10/10. It only works when the anchor's viewColumn is ≤ 8, and that count includes the user's own groups. Index 9+ has no command, and an index of exactly `count` creates a group (`editorCommands.ts:679-716`).
  3. `moveActiveEditor` by viewColumn. It activates the target group, but it moves an editor, so it is a different primitive.
  4. Current `focusNextGroup` cycling. It is correct and focus-independent for the same reason as 1 and 2, but it takes O(groups) steps.
- **Ruled out:** `Terminal.show` (PRESERVE); `terminal.focus` (needs DOM focus); `vscode.setEditorLayout` (rebuilds the whole grid, see below); any `groupId`-argument command (`TabGroup` has no `groupId`); option (b) "never re-activate" (impossible with commands that split only the active group, see below).
- **Open questions:** none blocking. One side note: with `workbench.editor.openSideBySideDirection` or the user's layout, nothing changes, because `newGroupRight/Below` take an explicit direction.

## Recommended code shape

```ts
// project(node) leaves firstLeaf(node)'s group active, so one hop back always lands on the anchor's group.
await vscode.commands.executeCommand(
  node.dir === "right" ? "workbench.action.focusLeftGroupWithoutWrap" : "workbench.action.focusAboveGroupWithoutWrap",
);
await waitForEditorGroups(() => (vscode.window.tabGroups.activeTabGroup === anchorTab.group ? true : undefined));
```

The step 3 command depends only on the split direction. The anchor `TabGroup` is used only for the wait/assert. If you prefer the index variant: `` `workbench.action.focus${["First","Second","Third","Fourth","Fifth","Sixth","Seventh","Eighth"][tab.group.viewColumn - 1]}EditorGroup` `` with a guard for `viewColumn > 8`.

## Details and evidence (VS Code tag 1.141.0)

Paths are relative to `src/vs/workbench/` unless noted.

### How focus-group commands activate a group

- `AbstractFocusGroupAction.run` → `editorGroupService.findGroup(scope, activeGroup, true)?.focus()` (`browser/parts/editor/editorActions.ts:277-292`). Directional variants: `FocusLeftGroup` etc. (`editorActions.ts:346-408`). `*WithoutWrap` variants: `findGroup({direction}, activeGroup, false) ?? activeGroup` then `.focus()` (`browser/parts/editor/editorCommands.ts:1070-1097`).
- `EditorGroupView.focus()` focuses the pane or element and then **unconditionally** fires `_onDidFocus` (`browser/parts/editor/editorGroupView.ts:1114-1125`).
- `EditorPart` subscribes to each group's `onDidFocus` and calls `doSetGroupActive(groupView)` (`browser/parts/editor/editorPart.ts:707-710`). Activation is therefore synchronous and independent of whether the DOM `focus` event fires in an unfocused window.
- `focusNth`: `getGroups(GRID_APPEARANCE)[groupIndex].focus()`. Commands exist only for indexes 0 to 7. An index equal to `count` creates a new group (`editorCommands.ts:679-716`, `toCommandId` `:720-731`).
- Direction lookup: `gridWidget.getNeighborViews(source, direction, wrap)` sorted by MRU, and the first result wins (`editorPart.ts:375-383`). With exactly one neighbour the result is deterministic.

### viewColumn mapping

- `TabGroup.viewColumn = editorGroupToColumn(...)` = index in `GRID_APPEARANCE` (+1 in the API) (`api/browser/mainThreadEditorTabs.ts:522`, `services/editor/common/editorGroupColumn.ts:42-46`). The model is rebuilt on every group add or remove (`mainThreadEditorTabs.ts:75-76`), so `viewColumn` is fresh after each `newGroup*`. `tabGroups.all` follows creation order (`editorGroupsService.groups`, `mainThreadEditorTabs.ts:518`), as the earlier agent said.
- `vscode.d.ts` `TabGroup` exposes only `isActive`, `viewColumn`, `activeTab`, `tabs` (`src/vscode-dts/vscode.d.ts:19375-19403`). There is no `groupId`, so `IEditorCommandsContext { groupId }` commands are not usable from an extension.

### Terminal paths (earlier findings verified)

- `$show(id, preserveFocus)` → `terminalEditorService.revealActiveEditor(preserveFocus)` (`api/browser/mainThreadTerminalService.ts:189-196`) → `_revealEditor` → `openEditor(input, { pinned, forceReload, preserveFocus, activation: EditorActivation.PRESERVE })` (`contrib/terminal/browser/terminalEditorService.ts:257-284`). PRESERVE means the group is neither activated nor restored (`editorGroupView.ts:1226-1283`). **Confirmed.**
- `focusInstance` = `_revealEditor` + `instance.focusWhenReady(true)` (`terminalEditorService.ts:127-134`). Activation only happens through xterm's DOM focus, which ends up in `editorPane.onDidFocus` (`editorGroupView.ts:525-526`). In an unfocused window, Chromium does not dispatch that event. **Consistent with the observed timeout.**
- `newGroupRight/Below`: `addGroup(activeGroup, dir)` + explicit `activateGroup(group)`, plus `focus()` only if the editor part had focus (`editorActions.ts:2467-2489`). That is why step 1 already works without OS focus. These actions take no arguments, so they always split the **active** group.

### `vscode.setEditorLayout`: ruled out

`applyLayout` merges surplus groups into the last one, then **rebuilds the whole grid** from the descriptor and reassigns existing group views in `GRID_APPEARANCE` order to the new leaves (`browser/parts/editor/editorPart.ts:517-566`, `doApplyGridState` `:1590-1618`). To keep the user's groups you would have to round-trip `getEditorLayout`, splice a subtree in, and rely on the in-order reuse. New leaves inserted mid-order shift every later existing group into a different leaf. The approach also loses sizes and resets the grid widget, so file editors get moved. Refuted as a safe option.

### Option (b): no order avoids re-activation

The only splitting primitives available to an extension (`newGroup*`, `splitEditor*`, `createTerminal`/`vscode.open` with `viewColumn`) split the **active** group, or create columns by `GRID_APPEARANCE` index with `preferredSideBySideGroupDirection` (`editorGroupColumn.ts:18-38`). That cannot express nesting. After a split the new group is active. In a tree where both children of some split are themselves splits (2×2), both the original group and the new group must be split later, so one of them has to be re-activated. Splitting the new group with `newGroupLeft/Above` adds a sibling in the same grid branch, not a nested split of the original. Filling pre-created groups via `createTerminal({ location: { viewColumn } })` needs no activation, but creating the skeleton has the same problem. So (b) can only shrink the number of re-activations, never remove them. (a) with a single exact hop is the direct answer.

### Invariant behind the directional hop

`project(n)`: leaf → nothing (the active group shows `n`). Split → split, open `firstLeaf(second)`, `project(second)`, hop back, `project(first)`. By induction, after `project(n)` the active group is `firstLeaf(n)`'s. A leaf case is trivial. A split case ends in `project(first)`, which ends in `firstLeaf(first) = firstLeaf(n)`. `firstLeaf(second)` is the top-left-most leaf of `second`'s region. It touches the edge shared with `first`'s region, which at that moment is the single anchor group spanning that whole edge. That makes it the unique neighbour. The prototype logs confirm one hop per split (for example, `deep`: Left, Above, Above, Above, Left).

## Prototype

- Test: `opus-research-1.proto-group-activation.test.ts` (next to this reply). Config: `opus-research-1.vscode-test.proto.mjs`. It uses a short `--user-data-dir`, because the scratch path makes the IPC socket path exceed the Unix limit (`listen EINVAL`). The worktree has already been removed, and the main checkout and its `dist` were not touched.
- Run: `node esbuild.mjs`, esbuild the test into `dist/test/extension/`, then `npx vscode-test --config .vscode-test.proto.mjs --label proto`. Result: `10 passing (5s)`, `window.state.focused=false` in every test.
- Setup per test: `file | region | file` (region = viewColumn 2), then project the tree with pseudoterminal editors. Assert the canonical (same-direction-flattened) shape from `vscode.getEditorLayout` + per-viewColumn active tab label, and that the final active tab is `firstLeaf(tree)`.

<!-- end of reply -->
