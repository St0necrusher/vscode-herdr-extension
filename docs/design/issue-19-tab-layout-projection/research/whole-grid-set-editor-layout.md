# opus-research-2: a Herdr Tab as the whole editor grid via `vscode.setEditorLayout`

## Summary

- **Verdict: feasible, with no hacks in the common path.** One `vscode.setEditorLayout` call builds the whole grid with proportions. Placing each Pane is then one primitive per Pane: `createTerminal({ location: { viewColumn } })` for a new Pane, or `moveActiveEditor { by: "group", to: "position", value }` for an open one. Final focus works for any index: `focus{Nth}EditorGroup` up to 8, then `focusNextGroup` hops, which are deterministic by grid index. Prototype: **11/11 passing** on VS Code 1.141.0, with `window.state.focused=false` in every test.
- **Q1, reuse and merge (proven):** existing groups map to leaves in grid order. Surplus groups are merged into the last leaf, and their editors are **appended after the last group's own editors, in source order**. A dirty untitled document stays dirty, with no prompt. Terminal editors keep the same `Terminal`, and `onDidCloseTerminal` never fires. **One caveat:** a *preview* editor that comes from a merged group becomes pinned. Preview editors in reused groups stay preview.
- **Q2, fewer groups (proven):** the new empty groups take the trailing leaves. The owner's example holds literally: left|right with files becomes top = left's files and bottom = right's files.
- **Q3, sizes (proven):** `size` values are relative weights inside each branch, and every level is normalised on its own. 2:1 gives 697:349, nested 1:3 gives 208:623, and the live 2×2 fixture (22|21, 16/15) gives 535:511 and 429:402. **The descriptor must be n-ary with alternating orientation per depth**, so same-direction chains have to be flattened first (proven: nesting `right(right(A,B),C)` as written yields a column).
- **Q4, moving an open Pane Editor from group N > 8 (proven, N=10 → cell 2):** call `focusGroupAt(N)` (index-based, see Q5), then `terminal.show(true)`, then `moveActiveEditor { to: "position", by: "group", value: M }`. The `Terminal` is the same object, and the command takes any M. No primitive moves an editor without activating its group: every move command acts on the active group's active or selected editor, and the API exposes no `groupId`.
- **Q5, focus at any index (proven, group 11 of a 3×4 grid):** `focusEighthEditorGroup` + `(k-8)×focusNextGroup`, or `focusLastEditorGroup` + `focusPreviousGroup` from the far end. NEXT and PREVIOUS go by `GRID_APPEARANCE` index, not MRU, so they are deterministic. Directional focus is **not** deterministic in general, because it is MRU-sorted. You don't need it.
- **Q6, one real conflict: `workbench.editor.closeEmptyGroups` (default `true`).** Moving the only editor out of a cell deletes that cell (proven). Fix: place Panes **fill before drain**. In a pure swap cycle of single-editor cells, park a throwaway, non-dirty placeholder first (proven). Other effects:
  - creating a terminal into a `viewColumn` activates that group even with `preserveFocus: true` (observed), so focus must be the last step;
  - `applyLayout` acts on the *active* editor part (an auxiliary window if it has focus);
  - a single-Pane Tab collapses every group into one.
- **Obsolete:** the recursive `newGroupRight/Below` projection, the directional hop, and the `viewColumn ≤ 8` throw in `focusPane`. ADR 0017's additive policy needs a superseding ADR. `tabLayoutTree` stays. The fixtures' `shape` field already has the descriptor's format.
- **Open questions:**
  1. Zoomed Herdr Tab (`layout.zoomed`): project the zoomed Pane only, or the full layout?
  2. Is a single-Pane Tab merging all groups into one acceptable?
  3. Placeholder for swap cycles, or accept a rarer fallback? See the alternatives below.
  4. Not verified: opening a Pane Editor into a *locked* group.

## Recommended algorithm

```ts
async openTab(layout: HerdrTabLayout): Promise<void> {
  const tree = tabLayoutTree(layout);                 // existing binary tree
  const cells = leaves(tree);                         // paneIds in grid (pre-order) order
  await vscode.commands.executeCommand("vscode.setEditorLayout", editorLayoutOf(tree, layout));
  await waitForEditorGroups(() => (vscode.window.tabGroups.all.length === cells.length ? true : undefined));
  // viewColumn of cell i is i+1 from here on: reused groups keep GRID_APPEARANCE order.

  // 1. New Pane Editors fill their cells. createTerminal({ location: { viewColumn } }) with no group activation needed.
  for (const [i, paneId] of cells.entries())
    if (!isOpen(paneId)) { await openPaneSurface(paneId, i + 1); await waitForTabIn(paneId, i + 1); }

  // 2. Misplaced open Pane Editors: fill before drain.
  //    A Pane may leave cell s only if s keeps another tab, or s already holds its own Pane.
  //    A cycle remains only when every remaining source holds nothing but one misplaced Pane:
  //    park a placeholder in one source, run the moves, then close it.
  for (const { paneId, to } of orderedMoves(cells))   // to = target viewColumn
    await movePaneEditor(paneId, to);                 // focusGroupAt(from); show(true); moveActiveEditor{position,to}; wait tab.group.viewColumn === to

  // 3. Each cell shows its Pane: terminal.show(true) uses PRESERVE, so it does not change the active group.
  for (const paneId of cells) revealInactive(paneId);

  // 4. Final focus, last, because steps 1-2 activate groups as a side effect.
  await focusGroupAt(cellOf(layout.focusedPaneId));   // Nth ≤ 8, else Eighth + Next hops (or Last + Previous)
  reveal(layout.focusedPaneId);                       // then wait activeTabGroup.activeTab === its tab
}

async function focusGroupAt(k: number) {
  if (k <= 8) await exec(`workbench.action.focus${ORD[k - 1]}EditorGroup`);
  else if (k - 8 <= count - k) { await exec("workbench.action.focusEighthEditorGroup"); for (let i = 8; i < k; i++) await exec("workbench.action.focusNextGroup"); }
  else { await exec("workbench.action.focusLastEditorGroup"); for (let i = count; i > k; i--) await exec("workbench.action.focusPreviousGroup"); }
  await waitForEditorGroups(() => (vscode.window.tabGroups.activeTabGroup.viewColumn === k ? true : undefined));
}
```

**How each step is awaited and verified:**
- `setEditorLayout` is synchronous in the renderer (`editorCommands.ts:361-373` → `applyLayout`). Wait on `onDidChangeTabGroups` until `tabGroups.all.length === leaves`. When the count does not change, nothing observable changes either: reused groups keep their order and `viewColumn`. Then `vscode.getEditorLayout` can assert the shape, which is a command round trip and therefore ordered after the layout.
- Creating a terminal: wait until the Pane's tab exists with `group.viewColumn === cell`.
- Moves: wait until the tab's `group.viewColumn === to`.
- Focus: wait until `activeTabGroup.viewColumn === k`. Before `moveActiveEditor`, assert `activeTabGroup.activeTab === paneTab`. This guards against a user click between steps, because the command moves the active group's *selected* editors.

## Descriptor and sizes

- **Shape:** the root is `{ orientation: dir === "right" ? 0 : 1, groups }`. Orientation alternates by depth (`gridview.ts:1733-1745` deserialises each child with `orthogonal(orientation)`). You must flatten same-direction chains: `right(right(A,B),C)` → `[A,B,C]`. A branch with ≤ 1 child collapses to a leaf (`grid.ts` `sanitizeGridNodeDescriptor`). Always pass `orientation`; otherwise VS Code flips or preserves the current one (`editorPart.ts:549-556`).
- **Order:** leaves are created in pre-order (`gridview.ts:1733-1755`), and reused group views are consumed in that order (`editorPart.ts:1335-1358`). So cell i = i-th leaf in pre-order = `viewColumn` i+1.
- **Sizes:** in a flattened branch, each child's `size` is its extent along that branch's axis: `rectangle.width` in a row (`right`), `rectangle.height` in a column (`down`). Use the regions `tabLayoutTree` already computes. Leaves use their pane rectangles; branches use the region that `build` receives. Missing sizes are filled with the average (`grid.ts:877-907`). Sizes are relative per branch, so raw Herdr cell counts work directly. Example from the live 2×2 probe: `{ orientation: 0, groups: [ { size: 22, groups: [{ size: 16 }, { size: 15 }] }, { size: 21, groups: [{ size: 16 }, { size: 15 }] } ] }` → 535:511 / 429:402 px. Equivalent alternative: `split.ratio` products along flattened chains (A = r1·r2, B = r1·(1−r2), C = 1−r1).

## Evidence (VS Code 1.141.0, paths under `src/vs/`)

- **`applyLayout`** (`workbench/browser/parts/editor/editorPart.ts:517-566`):
  - counts leaves;
  - when there are too many groups, `mergeGroup(group, groups[leaves-1])` for every index ≥ leaves, in `GRID_APPEARANCE` order;
  - then `doApplyGridState(descriptor, activeGroup.id, currentGroupViews)`, which reuses the group views (`:1335-1358`), so editors are never closed;
  - the active group stays active if it survived. In the prototype the active group was the merged one, and the merge target became active.
- **`mergeGroup`** (`editorPart.ts:942-993`) appends at `targetView.count` in source order and goes through `moveEditors`. Cross-group moves pin the editor (`editorGroupView.ts:1489`), which explains why a merged preview becomes pinned. A terminal editor move is an open followed by a close with `EditorCloseContext.MOVE`, so the terminal is not disposed (proven: no `onDidCloseTerminal`).
- **`moveActiveEditor { by: "group", to: "position", value }`** targets `getGroups(GRID_APPEARANCE)[value-1]` for any value (`editorCommands.ts:342-343`). It moves `activeGroup.selectedEditors` and then calls `targetGroup.focus()` (`:355`).
- **NEXT/PREVIOUS/LAST** are computed from `GRID_APPEARANCE` index (`editorPart.ts:385-410`). Direction lookup is MRU-sorted (`:375-383`).
- **`closeEmptyGroups`:** closing the last editor removes the group (`editorGroupView.ts:1617, 1684-1687`).
- **Terminal open:** `terminalEditorService.openEditor` → `editorService.openEditor(..., { preserveFocus }, viewColumn)` (`contrib/terminal/browser/terminalEditorService.ts:140-158`). In theory, `preserveFocus` avoids activation (`editorGroupView.ts:1226-1281`). In the prototype, the group still became active. Not root-caused; it doesn't matter as long as focus comes last.
- **`EditorParts.applyLayout` → `this.activePart.applyLayout`** (`editorParts.ts:801-803`).

## Prototype

- Files: `opus-research-2.proto-whole-grid.test.ts` and `opus-research-2.vscode-test.proto.mjs`, next to this reply.
- Run:
  1. Copy the config to the repo root.
  2. `npx esbuild <test> --bundle --platform=node --format=cjs --external:vscode --outfile=dist/test/proto2/whole-grid.test.js`.
  3. `npx vscode-test --config .vscode-test.proto2.mjs --label proto2`. It uses a short `--user-data-dir` because of the socket path limit.
- Clean-up: temporary repo files have been removed. `git status` shows only `?? docs/design/issue-19-tab-layout-projection/`, which this research did not create. It appeared during the session.
- **Results, 11 passing:**
  1. 5 groups (dirty untitled + pinned | preview | T3 | 2 files | T5 + file + preview) → 2×2. Layout after: `[[dirty*, pinned1],[preview2~],[T3],[file4a, file4b~, T5, file5, preview5]]`. No terminal closed, dirty kept.
  2. Owner example: `[[L1,L2],[R1,R2]]` → orientation 1, same lists, and then the terminals Top/Bottom are active in each cell.
  3. 2 groups → 6-leaf deep tree: `[[G1],[G2],[],[],[],[]]`.
  4. Sizes, as listed above.
  5. Naive same-direction nesting gives an orthogonal branch, so flattening is required.
  6. 10-column grid: P sits behind `f10b` in group 10 and moves to cell 2 (`[f2, P]`). Group 10 is kept, and the `Terminal` is the same.
  7. 3×4 grid: focus group 11 via Eighth + 3×Next, unfocused window. Then focusLast reaches 12.
  8. `createTerminal` into a `viewColumn` activates that group, with `preserveFocus` true or false.
  9. Moving the sole editor out of a cell removes the cell: 3 → 2 groups.
  10. Re-applying the same layout over an already projected Tab leaves the editors in place.
  11. Swap cycle `[B]|[A]` resolved with an empty untitled placeholder: the result is `[A]|[B]`, no terminal closed.

## Realistic conflicts (Q6)

- **`closeEmptyGroups`:** handled with fill-before-drain. Cycles only arise when the user rearranged this Tab's Pane Editors so that each one sits *alone* in another Pane's cell. Two ways to break a cycle:
  - a throwaway placeholder: a read-only virtual document from a `TextDocumentContentProvider` is cleaner than untitled, which bumps the `Untitled-N` counter;
  - temporarily setting `closeEmptyGroups=false`: rejected, because it writes user settings.
  When the setting is `false`, no placeholder is needed.
- **Activation side effects:** creating terminals and `moveActiveEditor` both activate groups, so do the final focus last. Focus-group commands activate synchronously without OS focus (opus-research-1).
- **Single-Pane Tab:** the whole grid becomes one group, and all user groups merge into it. This follows the policy, but users will notice; see open question 2.
- **Auxiliary editor windows:** the layout applies to the active editor part. When an auxiliary window has focus, its grid gets replaced and `viewColumn`s refer to it.
- **Merge side effects:** merged previews become pinned. Maximized or locked state of reused groups carries over on the group view. Lock is not verified, see open question 4.
- **Settings that do not interfere:** `openSideBySideDirection` (orientation is explicit). Grid restore on reload restores the projected grid like any user grid; restoring the Pane Editors themselves is the existing concern.
- **User clicking mid-sequence:** `moveActiveEditor` acts on the active group. The assert before the move narrows the race, but it can't close it fully. The current implementation has the same race.

## What becomes obsolete

- `OpenTabFeature.project` (recursive `newGroupRight/Below` + `focusLeft/AboveGroupWithoutWrap` hop) and `firstLeaf`. They are replaced by `editorLayoutOf(tree)`, plus placement and focus.
- `PaneTerminalSurfaceManager.openPaneInGroup`: its "open in active group, then move to `target.viewColumn`" logic is replaced by opening directly with `location: { viewColumn: cell }` and a separate `movePaneEditor`.
- The 8-command table in `focusPane` and its `viewColumn > 8` throw: replaced by `focusGroupAt(k)`.
- ADR `docs/adr/0017-*` (additive projection into the active group) is superseded by a new ADR for "Tab replaces the whole grid: groups reused in order, surplus merged into the last".
- `tabLayoutTree` and the fixtures stay. The fixture `shape` (`{ orientation, groups }`) is already the descriptor format minus sizes, so it can drive `editorLayoutOf` tests directly.

<!-- end of reply -->
