# Issue #19: a Herdr Tab opens as the whole editor grid

Status: **accepted by the architect with amendments; placement amended after the 12 → 13 → 12 bug: recreate instead of move (owner decision)** (`answers/astra-arch-1.md`; the architect stands in for the owner, see `progress.md`). Readiness gates resolved (`answers/astra-arch-2.md`); ready for implementation.

Requirements: issue #19 as amended by the owner's decisions in `progress.md` ("Owner decisions", "Owner intent"). Where #19's acceptance criteria conflict with them (never move file editors, adjacent-column fallback, partial-failure reporting), the owner's decisions win. Research: `research/whole-grid-set-editor-layout.md` (main evidence, 11 prototype tests on VS Code 1.141.0 in an unfocused window) and `research/group-activation.md`.

Starting point: branch `feat/19-open-tab-layout` (PR #72, unmerged) implements the superseded additive policy. This design replaces its projection; the trigger, the command, error reporting, `tabLayoutTree` and the test fixtures stay.

## Behaviour

Clicking a Tab row in the Panes View (rows exist only for Tabs with two or more Panes) makes the editor area the Tab's layout:

1. The editor grid gets exactly one group per Pane, with Herdr's split directions, nesting and proportions. Cell `i` (pre-order over the layout tree) is `viewColumn` `i + 1`.
2. Existing groups are reused in grid order: group `i` becomes cell `i`, keeping its editors. Surplus groups merge into the last cell, their editors appended after its own. Missing groups are created empty at the trailing cells.
3. Each Pane gets its Pane Editor in its cell. A Pane Editor that is already open anywhere is moved there (same `vscode.Terminal`, never closed or recreated); otherwise it is created in that cell.
4. Each cell shows its Pane Editor as the active tab; other editors stay behind it.
5. The Herdr-focused Pane (`layout.focusedPaneId`) ends focused, for any cell index.
6. A failure shows `Could not open Tab: <message>`; nothing is rolled back.

Zoom is ignored (the full layout is projected). Repeating the click on an already projected Tab ends in the same grid, terminals, visibility and focus, with no duplicate clients and no placeholder left; intermediate focus events are not promised away, and there is no cached-layout shortcut.

Supported baseline: the main window's editor grid with unlocked groups. Auxiliary editor windows and locked groups are real but outside this phase; no detection or fallback for them. A one-Pane Tab has no Tab row; a direct one-Pane `herdr.openTab` call would project one group like any other layout, with no special branch.

## Modules and responsibilities

```
views/sidebar/panes ──herdr.openTab(tabId)──▶ features/open-tab ──▶ modules/sessions (tabLayoutTree: pure)
                                                     │        └──▶ core/editor-groups (wait, focus by index)
                                                     └──▶ modules/pane-editors (PaneTerminalPlacement)
```

- `modules/sessions/tabLayoutTree` (pure rule): Herdr layout → editor-agnostic visual tree with sizes. Owns reconstruction from rectangles and same-direction flattening.
- `features/open-tab/OpenTabFeature`: owns the command and the sequence: tree → `vscode.setEditorLayout` descriptor → wait for the grid → place Panes → focus. Owns the descriptor mapping (VS Code format).
- `modules/pane-editors/PaneTerminalSurfaceManager` behind `PaneTerminalPlacement`: owns Pane Editor identity and tabs, so it owns placing a Tab's Pane Editors into cells, including the order of moves.
- `core/editor-groups`: domain-free VS Code helpers: `waitForEditorGroups` (exists) and focusing a group by `viewColumn`.

## Domain model

No new domain terms. Herdr Tab, Pane, Pane Editor as in `CONTEXT.md`. "Cell" and "editor grid" are VS Code representation words used in code and this document only.

`TabLayoutTree` changes shape: n-ary, flattened, with sizes.

```ts
type TabLayoutNode =
  | { kind: "pane"; paneId: string; size: number }
  | { kind: "split"; direction: SplitDirection; size: number; children: readonly TabLayoutNode[] }; // ≥ 2 children, no child split shares the direction
```

`size` is the node's extent along its parent's axis in Herdr cells (`width` under a `right` split, `height` under `down`); the root's size is unused (a documented sentinel such as 1 if the type needs one). A child split with the parent's direction is inlined (`right(right(A,B),C)` → `right[A,B,C]`), because VS Code's grid alternates orientation by depth and cannot express it otherwise; visually it is the same layout. Each promoted child keeps its own extent along the surviving axis; the removed branch's size is not copied onto them. VS Code normalises sizes per branch, so raw cell counts are valid weights; minimum group sizes and pixel rounding mean proportions are approximate, not exact.

## Data flow (primary scenario)

Owner's example: left|right groups with files, a 2-Pane top/bottom Tab, Pane B already open behind a file in the left group, Herdr focus on A.

1. Panes View row → `herdr.openTab(tabId)`.
2. Feature reads the snapshot layout, builds `down[A(h),B(h)]`, maps it to `{ orientation: 1, groups: [{ size }, { size }] }`, runs `vscode.setEditorLayout`, waits until `tabGroups.all.length === 2`. Left group → top cell, right group → bottom cell.
3. Feature builds one `PaneTerminalOpenRequest` per Pane from the same snapshot and calls `placePanes([A, B])` (index = cell):
   - new Pane Editors first: A is created with `location: { viewColumn: 1 }`;
   - then moves, fill before drain: B (in cell 1, which also holds files and A) moves to cell 2 by activating its group, revealing it, `moveActiveEditor { to: "position", by: "group", value: 2 }`, waiting for its tab in cell 2;
   - each cell's Pane Editor is revealed as its active tab (`Terminal.show(true)` does not change the active group).
4. Feature calls `focusPane(sessionId, A)`: activate cell 1 with `focusEditorGroup(1)`, reveal A, wait for focus.

Who writes what: VS Code owns groups; the manager owns the Pane ↔ terminal ↔ tab binding (its existing tab reconciliation keeps it current through moves and merges); the feature writes nothing persistent.

Failure: any step throwing (missing layout, timeout waiting for groups) ends the sequence; the feature shows the error. Groups and editors already changed stay.

## Public seams

```ts
// modules/pane-editors
export interface PaneTerminalPlacement {
  // requests[i] belongs in viewColumn i + 1; the grid already has requests.length groups.
  placePanes(requests: readonly PaneTerminalOpenRequest[]): Promise<void>;
  focusPane(sessionId: string, paneId: string): Promise<void>;
}

// core/editor-groups
export function focusEditorGroup(viewColumn: number): Promise<void>;
```

- `placePanes` receives requests carrying the existing identity data; array order defines columns. It never imports sessions and never runs `setEditorLayout`. Cells are not stored objects: after every create or move it re-reads live tab/group bindings rather than holding `TabGroup` objects as a plan.
- `placePanes` scheduler (fill before drain; moving a group's only editor deletes the group under `workbench.editor.closeEmptyGroups`, default on):
  1. Create missing Pane Editors directly in their columns through the existing opening path (no second terminal factory); await each tab in its column.
  2. From current bindings, move the first misplaced Pane Editor in target order whose source group keeps another tab after the move. Await its tab in the target column, then recompute.
  3. If misplaced Pane Editors remain but none can move safely (a cycle, e.g. `[B]|[A]`), open an empty untitled text document, pinned (`preview: false`), in the first candidate's source group, track that exact tab, and resume. Close that exact tab through the tab API as soon as the source holds its assigned Pane Editor. At most one placeholder at a time; disjoint cycles are handled in turn.
  4. Reveal every assigned Pane Editor as its cell's active tab without changing the active group, and await it. Ordinary `openPane` keeps its current reveal behaviour; the preserve-focus reveal is explicit for this path.
  - The placeholder is owned by the placement call: cleanup in `finally`, also on failure (the incomplete grid may then collapse). Never saved, filled, or closed by anything but its exact tab; cleanup never closes another editor; the primary error wins if cleanup also fails. The bumped `Untitled-N` counter is an accepted cost.
- `focusPane` activates the Pane Editor's actual group with `focusEditorGroup`, reveals it, and awaits both the active group and the active tab. Missing focus information keeps the existing validation; no fallback to the first or last Pane.
- `openPaneInGroup` is removed. `openPane` (single Pane rows) is unchanged.

## Expected file structure

```
src/modules/sessions/tabLayoutTree.ts        changed  n-ary flattened tree with sizes
src/modules/sessions/tabLayoutTree.test.ts   changed  expectations for the new shape
src/features/open-tab/OpenTabFeature.ts      changed  descriptor, setEditorLayout, placePanes, focusPane; project/firstLeaf removed
src/modules/pane-editors/paneTerminalPlacement.ts       changed  placePanes replaces openPaneInGroup
src/modules/pane-editors/PaneTerminalSurfaceManager.ts  changed  placePanes; focusPane via focusEditorGroup; openPaneInGroup removed
src/core/editor-groups/index.ts              changed  + focusEditorGroup
test/extension/tabLayoutFixtures.test.ts     changed  fixtures gain sizes; shape stays the getEditorLayout format
test/extension/tab-layout.test.ts            rewritten for the new policy
docs/adr/0017-…                              rewritten (unmerged): whole-grid projection; new file name
```

An estimate, not a constraint: no new files are expected beyond the renamed ADR; small private helpers may be split out (Decisions §8). `src/modules/pane-editors/PaneTerminalSurface.ts` may change minimally for the preserve-focus reveal.

## Decisions (architect, `answers/astra-arch-1.md`)

1. **Move cycles:** an owned, empty, pinned untitled placeholder (see the scheduler). Rejected: a read-only virtual document (provider registration and lifecycle are disproportionate for a temporary resource); re-applying the layout after a collapse (it can shift user editors off their assigned cells, e.g. `[B]|[A]|[file,C]` ends with `file` in cell 2); temporarily setting `closeEmptyGroups=false` (writes user settings).
2. **Focus beyond eight:** `focusEighthEditorGroup` then exactly `k − 8` × `focusNextGroup`, awaited in sequence, then the active-group predicate. No probing loop, no directional navigation, no far-end optimisation, no eight-group cap.
3. **Sizes:** raw Herdr extents as branch weights (see Domain model).
4. **Out of scope:** coordination with user clicks during the sequence, auxiliary windows, locked groups, zoom, VS Code pinning merged preview editors. A pre-existing editor multi-selection is in scope: moving selected file editors along with a Pane Editor would violate the policy (readiness gate 1).
5. **Waits:** await `setEditorLayout`, then the desired group count with the existing bounded waiter. When the count does not change, command completion is the ordering barrier; do not wait for an event that need not occur. No production shape-polling loop; the shape is asserted at the test seam.
6. **Failure:** stop at the first failing operation, clean up only owned temporary resources, keep what succeeded, show `Could not open Tab: <message>`. No rollback, no alternate layout, no retries.
7. **Lifecycle:** follow the existing resource-lifetime checks and `IMPLEMENTATION.md` async/lifecycle rules for disposal or session replacement during awaits; no cancellation framework.
8. **Not added:** a planner service, a placement framework, a copied placement store, settings mutation, compatibility fallback. The file list below is an estimate; small private helpers may be split out, public exports go through block `index.ts`.
9. **Documentation:** no `CONTEXT.md` change ("cell", "grid", "placeholder" are implementation words). ADR 0017 is unmerged, so it is replaced and renamed for the whole-grid policy, recording the loss of the old "file editors never move" guarantee, preserved file contents and dirty state, weighted layout, and index-based focus. Scheduling details stay in this design.

## Recreate instead of move (owner decision after the 12 → 13 → 12 bug)

Supersedes the move-based placement (`moveActiveEditor`, fill before drain, the cycle placeholder, source-group activation) and the earlier "accepted limitation". Evidence: `reports/bug-tab-switch-1.md`, `research/hidden-merge-rebinding.md`; architect: `answers/astra-arch-5.md`; owner decision in `progress.md`.

- **Why.** VS Code moves an editor as open-in-target then close-in-source; the source close unregisters the terminal, and it is re-registered only when visible. A Pane Editor moved while hidden (by a surplus merge) becomes an orphan: rename, `show`, `dispose` do nothing, its Tab can never be rebound, and the next projection deadlocks. Reconnecting to Herdr is already the normal cost of a Herdr `pane.moved` (same Terminal retargeted, new client, screen from Herdr), so recreating a Pane Editor costs about the same.
- **Sequence.** For a Tab with `n` Panes:
  1. Before `setEditorLayout`, close (through the manager, by the bound Tab) every Pane Editor that would otherwise move: any Pane Editor, of any Tab, in a group with `viewColumn > n`; and this Tab's Pane Editors not in their target group. Await their closure. VS Code then merges only non-terminal editors.
  2. `setEditorLayout`, await the group count.
  3. For each Pane in cell order: keep its Pane Editor if it is already in its cell, otherwise create it in its cell. Show each cell's Pane Editor as its active tab.
  4. Focus the Herdr-focused Pane last (`focusEditorGroup` + reveal), as before.
- **Consequences.** A recreated Pane Editor is a new `Terminal` with a new Herdr client; the Pane in Herdr is untouched. Pane Editors already in their cell and other Tabs' Pane Editors in groups `1..n` are kept, so a repeat click recreates nothing. Closing a misplaced Pane Editor that was alone in its group removes that group before the layout, so later groups shift one cell earlier; accepted. Manual drags and `Join Groups` keep today's behaviour (rebind via the synthetic name; a hidden manual merge can still orphan): #73.
- **Removed.** `moveActiveEditor` placement, fill before drain, the untitled placeholder, cycle handling, and source-group activation before a move.

## Readiness gates

The research proved the platform primitives, not these application assumptions. Both are checked by a focused prototype (`research/readiness-gates.md`) before implementation:

1. **Selection isolation — passed** (`research/readiness-gates.md`, Gate 1): revealing a Pane Editor (`Terminal.show`, `surface.reveal`, `focusPane`) resets its group's selection to the Pane alone (VS Code `editorGroupModel.ts:418`), so the reveal before `moveActiveEditor` is the isolation; no other primitive. Checked: with a file editor and the Pane Editor multi-selected in one group (file active, and Pane active), revealing the Pane Editor and moving it moves only the Pane; files stay in their group. If revealing does not isolate the selection, a supported primitive that does is identified and validated.
2. **Manager identity through merge and move — identity holds, client continuity fails** (Gate 2): every cross-group change briefly unbinds the Pane, restarting its Herdr client and flickering its title, because VS Code creates a new `Tab` on a group change and the manager rebinds only by the synthetic label. **Accepted as a limitation of this phase** (`answers/astra-arch-2.md`, option A); fixing it is #73, not a slice of #19. Checked: through the real `PaneTerminalSurfaceManager`, after initial binding and rename, a surplus merge and a later move keep the same surface and Terminal per Pane with at most one concurrent Herdr client (client continuity is not preserved, see the accepted limitation), the manager's tab binding follows the moved tab, and no pseudoterminal close fires; repeated with two Panes that have identical display names. If it breaks, the fix belongs to the existing identity owner, never recreating the terminal.

## Verification plan (preliminary, `testing-scenarios`)

Extension tests at the editor-group seam (`vscode.getEditorLayout` shape, tabs per `viewColumn`, active tab per cell, focused tab), literal expectations, unfocused window.

Critical now:

1. One group → the live 2×2 probe Tab: shape, each cell's active tab is its Pane, Herdr-focused Pane focused.
2. Owner example: left|right groups with files → top/bottom Tab: left files in the top cell, right files in the bottom cell, each behind its Pane Editor.
3. Surplus merge: five groups (one with a dirty file) → a 4-Pane Tab: cell 4 holds the editors of groups 4 and 5 in order; the dirty file stays dirty.
4. Fewer groups: two groups → a 4-Pane Tab: two new cells hold only their Pane Editors.
5. Already-open Pane Editor alone in a wrong cell moves to its cell: same `Terminal`, never closed, grid shape intact (fill before drain).
6. Swap cycle `[B]|[A]` → `[A]|[B]`: same terminals, no placeholder left.
7. Proportions: a 2:1 split gives groups in that proportion (within pixel rounding).
8. Repeat click on a projected Tab changes nothing.
9. A Tab with more than eight Panes focused on a Pane beyond the eighth cell ends with that Pane focused.

10. A Pane Editor moving out of a group beyond the eighth into its cell (exercises source activation, not only final focus).
11. Scenario 6 also covers a three-cycle or two disjoint cycles next to an unaffected group holding a file, with identity assertions and no placeholder left.

Optional: deeper mixed nesting shapes beyond the probe.

Pure rule (`tabLayoutTree.test.ts`): reconstruction, flattening and sizes over the shared fixtures, as today.

Deliberately excluded: the error notification path, VS Code's own merge/reuse behaviour beyond what scenarios 2–4 observe, private helpers, races with user input.
