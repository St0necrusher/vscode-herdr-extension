# Slice 1 `production`: whole-grid projection of a Herdr Tab

Worker rules: `briefs/common.md`. Design: `architecture.md` (authoritative). Branch `feat/19-open-tab-layout` already has the superseded additive policy (commits 52af907, 4c70c74); you replace its projection.

## Owned files

- `src/modules/sessions/tabLayoutTree.ts` and `tabLayoutTree.test.ts`
- `test/extension/tabLayoutFixtures.test.ts` (sizes in the expected trees and, if needed, the editor-group shapes; keep the `getEditorLayout` shape format)
- `src/core/editor-groups/index.ts`
- `src/modules/pane-editors/paneTerminalPlacement.ts`, `PaneTerminalSurfaceManager.ts`, `index.ts`, and `PaneTerminalSurface.ts` only if the preserve-focus reveal needs it (say so in the report)
- `src/features/open-tab/OpenTabFeature.ts`
- A new small private helper file in these blocks is allowed (`architecture.md`, Decisions 8); public exports go through the block `index.ts`.

Not owned: `test/extension/tab-layout.test.ts` (slice 2), ADRs, docs.

## What to build

Behaviour (`architecture.md`, "Behaviour"): clicking a Tab row makes the editor area the Tab's layout: one group per Pane (cell `i` = `viewColumn` `i + 1`, pre-order), existing groups reused in grid order, surplus merged into the last cell, missing ones created empty at the trailing cells; each Pane Editor in its cell as the active tab (moved if already open, same `vscode.Terminal`, otherwise created there); the Herdr-focused Pane ends focused; failure shows `Could not open Tab: <message>`, no rollback. Zoom ignored; no cached-layout shortcut.

Tree shape (`Domain model`):

```ts
type TabLayoutNode =
  | { kind: "pane"; paneId: string; size: number }
  | { kind: "split"; direction: SplitDirection; size: number; children: readonly TabLayoutNode[] }; // ≥ 2 children, no child split shares the direction
```

"`size` is the node's extent along its parent's axis in Herdr cells (`width` under a `right` split, `height` under `down`); the root's size is unused (a documented sentinel such as 1 if the type needs one). A child split with the parent's direction is inlined (`right(right(A,B),C)` → `right[A,B,C]`)… Each promoted child keeps its own extent along the surviving axis; the removed branch's size is not copied onto them. VS Code normalises sizes per branch, so raw cell counts are valid weights."

Feature (`Modules and responsibilities`): "`OpenTabFeature`: owns the command and the sequence: tree → `vscode.setEditorLayout` descriptor → wait for the grid → place Panes → focus. Owns the descriptor mapping (VS Code format)." Descriptor example: `{ orientation: 1, groups: [{ size }, { size }] }` (`orientation` 0 = `right`, 1 = `down`).

Seams (`Public seams`, verbatim):

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

- "`placePanes` receives requests carrying the existing identity data; array order defines columns. It never imports sessions and never runs `setEditorLayout`. Cells are not stored objects: after every create or move it re-reads live tab/group bindings rather than holding `TabGroup` objects as a plan."
- Scheduler ("fill before drain; moving a group's only editor deletes the group under `workbench.editor.closeEmptyGroups`, default on"):
  1. "Create missing Pane Editors directly in their columns through the existing opening path (no second terminal factory); await each tab in its column." (Today `openPaneSurface` creates in the active group: `PaneTerminalSurfaceManager.ts:44-68`; creation with `location: { viewColumn }` needs the column passed through; `surfaceFactory.create(selection, viewColumn, name)` already takes one.)
  2. "From current bindings, move the first misplaced Pane Editor in target order whose source group keeps another tab after the move. Await its tab in the target column, then recompute." A move is: activate the source group, reveal the Pane Editor (this resets the group's selection to the Pane alone, so `moveActiveEditor` moves only the Pane: Gate 1, no other isolation), `moveActiveEditor { to: "position", by: "group", value: <column> }`.
  3. "If misplaced Pane Editors remain but none can move safely (a cycle, e.g. `[B]|[A]`), open an empty untitled text document, pinned (`preview: false`), in the first candidate's source group, track that exact tab, and resume. Close that exact tab through the tab API as soon as the source holds its assigned Pane Editor. At most one placeholder at a time; disjoint cycles are handled in turn."
  4. "Reveal every assigned Pane Editor as its cell's active tab without changing the active group, and await it. Ordinary `openPane` keeps its current reveal behaviour; the preserve-focus reveal is explicit for this path."
  - "The placeholder is owned by the placement call: cleanup in `finally`, also on failure (the incomplete grid may then collapse). Never saved, filled, or closed by anything but its exact tab; cleanup never closes another editor; the primary error wins if cleanup also fails. The bumped `Untitled-N` counter is an accepted cost."
- "`focusPane` activates the Pane Editor's actual group with `focusEditorGroup`, reveals it, and awaits both the active group and the active tab. Missing focus information keeps the existing validation; no fallback to the first or last Pane."
- `focusEditorGroup` (Decision 2): "`focusEighthEditorGroup` then exactly `k − 8` × `focusNextGroup`, awaited in sequence, then the active-group predicate. No probing loop, no directional navigation, no far-end optimisation, no eight-group cap." (Columns 1–8 use the direct First…Eighth commands, as `focusPane` does today at `PaneTerminalSurfaceManager.ts:93-107`; move that mapping to `core/editor-groups`.) It must also await the group becoming active.
- Waits (Decision 5): "await `setEditorLayout`, then the desired group count with the existing bounded waiter. When the count does not change, command completion is the ordering barrier; do not wait for an event that need not occur. No production shape-polling loop."
- Failure (Decision 6): "stop at the first failing operation, clean up only owned temporary resources, keep what succeeded, show `Could not open Tab: <message>`. No rollback, no alternate layout, no retries."
- Lifecycle (Decision 7): "follow the existing resource-lifetime checks and `IMPLEMENTATION.md` async/lifecycle rules for disposal or session replacement during awaits; no cancellation framework."
- Not added (Decision 8): "a planner service, a placement framework, a copied placement store, settings mutation, compatibility fallback."
- Accepted limitation: a Pane Editor that changes group "may briefly lose presence, flicker its title to `session:pane`, and stop and restart its Herdr client". Do not touch the manager's rebind logic (`reconcileTabBindings`), add heuristics, grace timers, or projection-only suppression. "Repeating a projection with editors already placed causes no unnecessary moves, so no identity-rebind restarts": step 2 must move nothing when bindings already match.
- `PaneTerminalSurfaceManager` stays the one owner of Pane ↔ terminal ↔ tab bindings; the feature builds one `PaneTerminalOpenRequest` per Pane from the same snapshot (`paneTerminalOpenRequest(sessionId, pane, paneName(pane))`, as today at `OpenTabFeature.ts:36`).

## Becomes obsolete (delete, leave no trace)

- `project`, `firstLeaf`, the `newGroupRight/newGroupBelow` + focus-neighbour sequence in `OpenTabFeature.ts`.
- `openPaneInGroup` in `paneTerminalPlacement.ts` and the manager.
- The throw "VS Code can focus only the first eight editor groups" in `focusPane`.
- The binary `first`/`second` shape of `TabLayoutTree`; consumers update to the n-ary tree.

## Expected observable behaviour

Owner's example: left|right groups with files, a 2-Pane top/bottom Tab, Pane B already open behind a file in the left group, Herdr focus on A. After the click: `getEditorLayout` is `{ orientation: 1, groups: [{ size }, { size }] }`; the left group's files are in the top cell behind A, the right group's files in the bottom cell, B moved to the bottom cell and its editor shown first; same B `Terminal`, not closed; A focused. Five groups and a 4-Pane Tab: cell 4 holds the editors of groups 4 and 5 in order. Two groups and a 4-Pane Tab: two new cells hold only their Pane Editors. Repeating the click ends in the same state with no placeholder tab left. A Tab with more than eight Panes focused on a Pane beyond the eighth cell ends with that Pane focused.

## Completion criteria

- The behaviour above holds; everything under "Becomes obsolete" is gone; no leftover references.
- `tabLayoutTree.test.ts` and fixtures express the new n-ary shape with sizes (literal expected trees; `nested right` flattens to `right[A,B,C]`; sizes as the fixture rectangles give them); the rule is tested over the shared fixtures, as today. Add a fixture only if a size/flattening rule would otherwise be untested.
- All gates in `common.md` green except the exclusions below.
- Report lists the Questions, any needed change outside owned files, and the failing tests by name.

## Exclusions

- Do not rewrite or fix `test/extension/tab-layout.test.ts` (slice 2). It encodes the old policy and will fail or stop compiling against the new seam; that is expected. If it breaks `npm run typecheck`/`lint` (it imports the feature and the manager), do not edit it: list each failure in the report with the reason, and run the other gates (`npm test`, `npm run test:extension` with the old file's failures identified by name) as far as they go. The only other expected failure is the known fresh-window focus test.
- No ADR, `CONTEXT.md`, or other doc edits (the coordinator rewrites ADR 0017 after acceptance).
- No new extension tests; write none outside `tabLayoutTree.test.ts`. If you consider a pure-unit test for the scheduler necessary, ask first.

## Validation expectations

`npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension`, foreground. Expected: `npm test` green; typecheck/lint/format/build must be green (architect, `answers/astra-arch-3.md`); if the old `tab-layout.test.ts` would block them, report it before working around it; extension tests failing only in `tab-layout.test.ts` and the fresh-window focus test. Anything else red is yours.
