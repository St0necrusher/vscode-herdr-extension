# Review: slice `production`, round 2

Reviewer: Claude (Opus), read-only.

Inputs:
- `reviews/production-1.md`
- `reports/production-2.md`
- `git diff HEAD`

I did not rerun the checks the worker reported:
- typecheck, lint, format and `npm test` are green;
- the extension suite has only the same two expected failures.

## Completion criteria

Unchanged from round 1. Each criterion is met. The line references have shifted:
- **Feature sequence:** `src/features/open-tab/OpenTabFeature.ts:32-46`.
- **Descriptor mapping:** `OpenTabFeature.ts:48-63`.
- **`placePanes`:** `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:73-159`.
- **`focusPane`:** `PaneTerminalSurfaceManager.ts:161-168`.
- **`focusEditorGroup`:** `src/core/editor-groups/index.ts:14-26`.
- **Unchanged since round 1:** the tree, the fixtures and the seam. Their diff stats are identical.
- **Obsolete code:** none remains in `src/` or `test/`.

## `git diff` outside the owned files

Empty. The same seven owned files changed. The only untracked files are under `docs/design/**`.

## Assertions, tests and fakes

Unchanged since round 1, and all allowed.
- No test file changed in round 2.
- No production code was bent to suit tests.
- No fakes changed.

## Round-1 corrections

1. **Applied.** The feature has no `disposed` flag and no `ensureCurrentSession`.
   - The catch at `OpenTabFeature.ts:20` is unconditional again.
   - The sequence at `:41-45` carries the captured `sessionId` through without rechecking it.
2. **Applied.** The manager has no `ensureAvailable`, no disposal check and no "replaced" check.
   - No probe throws.
   - `requireSurface` (`:170-174`) is the plain lookup with the old error. It runs where a surface is first needed: in `bindings`, in the final reveal and in `focusPane`.
   - `waitForPaneTab` (`:176-182`) reads `managed.tab` and an optional column, and does not throw.
3. **Applied.** `waitForEditorGroups` matches HEAD, with no try/catch. The core diff only adds `focusEditorGroup`.
4. **Applied.** The placeholder state is one tracked tab, `let placeholder` at `:78`.
   - The document is local to the blocked-move branch, and its tab is found once.
   - In the loop, the placeholder is closed and cleared at `:134`.
   - The failure `catch` (`:149-157`) closes only that tab and swallows only the cleanup error. It then rethrows the primary error.
   - There is no `finally`, no failure flag, no fallback search and no close-result guard.
   - The success path still always ends with the placeholder closed. The round-1 reasoning about the loop still holds.
5. **Applied.** There is no recompute after closing the placeholder. The only recompute is the one after a create or move, at `:125`.

**Extra change: the final reveal waits once per cell.** At `:140-148` the loop calls `terminal.show(true)`, then runs one bounded wait for `managed.tab.isActive` with the tab in the cell's column.
- This keeps the design's requirements: the tab is active in its own cell, and the active group does not change.
- It drops the earlier wait for the tab binding, which the combined predicate already covers.

## Standards and owner preferences

No violations found.
- No casts and no `any`.
- Errors are formatted through `errorMessage`.
- No disposal or session-replacement guards.
- No flag soup.
- The empty `catch` at `:153` is justified: the design requires that the primary error wins if cleanup also fails. Closing a stale placeholder tab after a collapsed failure can really throw.

## Workarounds and over-engineering

None new. The remaining narrowing throws are acceptable:
- `focusEditorGroup` when the command is `undefined` (`core/editor-groups/index.ts:16`);
- `PaneTerminalSurfaceManager.ts` when the first misplaced editor is `undefined`, in the blocked branch at `:99-101`.

Both are forced by the no-non-null-assertion rule, and neither guards a reachable state.

The worker kept the `Array.from` + `for…of` loop in `focusEditorGroup`. That was an optional nit and is acceptable.

## Correctness against the design

Still correct, and nothing in round 2 changed it:
- Panes are created in their cells before any move (fill before drain).
- Each move picks the first misplaced editor, in target order, whose source group keeps another tab.
- A move activates the source group and reveals the Pane before `moveActiveEditor`, which isolates the selection.
- Bindings are recomputed after every create or move.
- There is at most one placeholder: it opens in the first candidate's source group, pinned, and closes once that group holds its assigned Pane.
- Nothing moves when the editors are already placed.
- The final reveal makes each Pane its cell's active tab without changing the active group.
- Focus comes last.

The descriptor and size mapping are unchanged from round 1 and correct:
- same-direction children are flattened;
- orientation follows depth;
- promoted children keep their own sizes;
- the root size is the sentinel 1.

## Verdict

Accept.
<!-- end of reply -->
