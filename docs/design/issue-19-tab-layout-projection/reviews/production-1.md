# Review: slice `production`, round 1

Reviewer: Claude (Opus), read-only. Inputs: `briefs/production.md`, `briefs/common.md`, `architecture.md`, `progress.md`, `answers/astra-arch-1..3.md`, `reports/production-1.md`, `git diff HEAD`. I did not rerun the worker's checks; they reported typecheck, lint, format and `npm test` green, plus the two expected extension failures.

## Completion criteria

- **Whole-grid behaviour.**
  - Descriptor, `setEditorLayout`, group-count wait, placement, focus: `src/features/open-tab/OpenTabFeature.ts:38-52`.
  - Descriptor mapping: `OpenTabFeature.ts:71-77`.
  - Requests built in pre-order from one snapshot, before any layout change: `OpenTabFeature.ts:38-42,79-81`.
  - Create missing editors in their columns: `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:108-114`, through the existing path with a column parameter at `:48-51`.
  - Move loop, placeholder and preserve-focus final reveal: `PaneTerminalSurfaceManager.ts:124-173`.
  - `focusPane` through `focusEditorGroup`: `PaneTerminalSurfaceManager.ts:182-193`.
  - `focusEditorGroup`: `src/core/editor-groups/index.ts:14-26`.
  - Error text unchanged (`Could not open Tab: <message>` via `errorMessage`): `OpenTabFeature.ts:21`.
  - Zoom is ignored and there is no cached-layout shortcut: met. The tree ignores zoom, and `setEditorLayout` runs on every click.
- **Obsolete code removed.**
  - `project`, `firstLeaf`, the `newGroupRight`/`newGroupBelow` and neighbour-focus sequence, `openPaneInGroup`, the eight-group throw, and binary `first`/`second` are all gone. A search finds no hits in `src/` or `test/`.
  - The only remaining hits are in `docs/adr/0017-…`, which the coordinator rewrites (out of slice).
- **n-ary tree with sizes and flattening.**
  - Tree: `src/modules/sessions/tabLayoutTree.ts:3-10,45-63`.
  - Literal expected trees: `test/extension/tabLayoutFixtures.test.ts`.
    - `nested right` (`:99`) expects `right[A(11),B(11),C(21)]`. The promoted children keep their own extents, and the removed branch's 22 is not copied onto them.
    - `live 2x2 probe` (`:109`) expects 22/21 and 16/15.
  - The rule is exercised over the shared fixtures: `src/modules/sessions/tabLayoutTree.test.ts:6-8`.
  - No fixture was added. None was needed, because the `nested right` case covers flattening and sizes.
- **Gates.** The worker reported each command's result. The extension failures are named: `Tab layout projection > projects into the active cell of an occupied grid without changing the other cell` (obsolete policy, slice 2) and the fresh-window keyboard-focus test. Both are allowed.
- **Report contents.** The report has a Questions section (none), needed changes outside the owned files (none) and the failing tests by name: met.

## `git diff` outside the owned files

Empty. Exactly the seven owned files changed. The untracked files are only under `docs/design/**`. `src/modules/pane-editors/index.ts` and `PaneTerminalSurface.ts` are unchanged.

## Assertions, tests, fakes

- `tabLayoutTree.test.ts`: only the test title changed. The assertion `toEqual(tree)` is unchanged.
- In the fixtures, the expected trees changed to the new n-ary shape with sizes, as the brief allows. The `shape` expectations (the `getEditorLayout` format) are unchanged.
- The fixture now builds wire layouts from a separate binary `source` tree. This is required, because the expected tree is flattened and can no longer generate the wire rectangles.
- `test/extension/tab-layout.test.ts` is untouched.
- No production code is bent to suit tests. There are no new exports beyond the seam `focusEditorGroup`, and no fakes changed.

## Standards and owner preferences

- No casts, no `any`, layers respected, the peer rule holds, and errors are formatted through `errorMessage`.
- **Violation of the owner's preference** "no guards against unrealistic corner cases (disposal/session-replacement checks, try/catch around things that can't throw, flag soup)". Details are in the next section.
- **Decision 7** says "follow the *existing* resource-lifetime checks". The existing checks were:
  - the surface lookup in `focusPane` (`getSurface` returns `undefined`, which throws "Pane Editor is no longer open");
  - in features, carrying the initial `sessionId` through awaits without re-checking it (`RunNpmScriptFeature.ts:42-74`, `CreateSpaceFeature.ts:28-43`, `renameTab.ts:12-25`).

  The slice adds a new, denser regime instead.

## Workarounds and over-engineering

### 1. Session and disposal currency checks in the feature

`OpenTabFeature.ts:10,21,28` (the `disposed` flag that suppresses the error toast) and `:44-59` (`ensureCurrentSession`, called four times and also inside a waiter probe).

- **Why it is not required.**
  - The feature is disposed only on extension deactivation. A toast during deactivation is harmless, and no current requirement suppresses it.
  - A session replaced inside the roughly one-second projection is a user or connection race. Decision 4 and Decision 8 exclude coordination with such races.
  - Continuing with the captured `sessionId` is what every other feature does. It only places and focuses the clicked Tab's Pane Editors, which the manager still owns.
  - If they are gone, the manager's own lookup fails with "Pane Editor is no longer open".
- **Simpler alternative.** Remove `disposed`, `ensureCurrentSession` and all its calls. Keep the old catch at `:21` unconditional, as in HEAD.

### 2. Throwing probes and disposal or replacement checks in the manager

- **Where.**
  - `ensureAvailable`: `PaneTerminalSurfaceManager.ts:110,195-197`.
  - The disposal check inside `requireSurface`: `:200`.
  - The `=== managed` / "Pane Editor was replaced" check in `waitForPaneTab`: `:212-213`.
  - `requireSurface` inside waiter probes: `:170,190`.
  - Post-await re-checks whose results are discarded: `:132,138,141,187`.
- **Why it is not required.**
  - **Disposal.** Disposal happens only on deactivation, and `dispose` clears `surfacesBySession`, so any later lookup already fails.
  - **Replacement.** A different `ManagedPaneSurface` under the same key can only appear if the Pane is closed and reopened by a user click during the projection, which is an excluded race.
  - **A Pane closed during the projection.** The next lookup (`bindings`, `focusPane`) fails, or the bounded waiter times out. Either way this is Decision 6's "stop at the first failing operation".
  - Each of these checks only changes which error message appears, or how soon.
- **Simpler alternative.**
  - Keep one plain lookup where a surface is needed: the HEAD `focusPane` check, reused at `bindings` `:118` and at the final reveal `:165`.
  - Make `waitForPaneTab` a non-throwing probe on `managed.tab`, with an optional column.
  - Drop `ensureAvailable`, the `=== managed` check, and the checks inside probes and after awaits.

### 3. The waiter catching throwing probes

`src/core/editor-groups/index.ts:39-48`.

- **Why it is not required.** It exists only to support the throwing probes from findings 1 and 2. Every remaining probe reads `tabGroups` state, a `Tab` field, or a URI comparison, and none of them can throw.
- **Simpler alternative.** Revert `check` to its HEAD form.

### 4. Placeholder cleanup complexity

`PaneTerminalSurfaceManager.ts:78-106,174-178`.

- **What is there.**
  - Two pieces of mutable state, `placeholder` and `placeholderDocument`.
  - A `findPlaceholder()` fallback in `closePlaceholder` (`:91`) for a tab "created before a failed show/wait completes".
  - A `projectionFailed` flag with a catch-rethrow, plus a `cleanupPlaceholder` try/catch wrapper.
  - An `if (!closed) throw` (`:94`).
- **Why it is not required.**
  - The fallback covers only `waitForEditorGroups(findPlaceholder)` timing out after `showTextDocument` resolved. That would require the tab to exist and still not be found by the same probe, which is unrealistic.
  - After finding 2, nothing between `showTextDocument` and the assignment can throw.
  - An empty, never-edited untitled tab cannot veto its own close, so `closed === false` is unreachable.
  - On the success path the loop always closes the placeholder before it exits. Proof: the loop ends only when nothing is misplaced. At that point the placeholder's source group P holds its assigned Pane, and the close check at `:150-161` runs in that same iteration. So cleanup is needed only on failure, and the flag that distinguishes the two paths is unnecessary.
- **Simpler alternative.**
  - Keep a single `let placeholder: vscode.Tab | undefined`. Make the document a local in the placeholder branch and find its tab once.
  - Close the placeholder in the loop with `await vscode.window.tabGroups.close(placeholder); placeholder = undefined;`.
  - Replace `finally`, `projectionFailed` and `cleanupPlaceholder` with `catch (error) { if (placeholder !== undefined) await vscode.window.tabGroups.close(placeholder).catch(() => undefined); throw error; }`.
  - Closing the placeholder's stale tab after a collapsed failure can really throw, and the design says the primary error wins, so the swallowed cleanup error there is justified.

### 5. Minor

- **Redundant recompute.** `PaneTerminalSurfaceManager.ts:159`: the extra `current = await bindings()` after closing the placeholder is redundant, because closing it moves no Pane Editor. Drop it.
- **Loop style.** `core/editor-groups/index.ts:18-21`: `Array.from({ length })` followed by `for…of` could be a plain `for (let column = 8; column < viewColumn; column++)`. This is optional.
- **Accepted as is.** The `command === undefined` throw (`index.ts:16`) and the `first === undefined` throw (`PaneTerminalSurfaceManager.ts:130`) are type narrowing required by the no-cast rule. Both are acceptable.

## Correctness against the design

- **Scheduler: correct.**
  - Fill before drain: creation of missing editors at `:108-114` comes before any move.
  - Move choice: the first misplaced editor in target order whose source keeps another tab (`:127`, `tabs.length > 1`).
  - A move:
    1. Activates the source and reveals the Pane, which isolates the selection (`:140`, `focusPane`).
    2. Runs `moveActiveEditor` to the target position (`:142-146`).
    3. Awaits the Pane's tab in the target column (`:147`).
    4. Recomputes the live bindings (`:149`).
  - No moves happen when the editors are already placed: `misplaced` is empty at `:125`.
- **Placeholder: correct.**
  - It goes into the first candidate's source group, pinned (`:131-137`), and is closed when the source holds its assigned Pane (`:150-161`).
  - **At most one placeholder: holds.** In the blocked state, every misplaced Pane is the only tab in its group, and the misplaced Panes form cycles. A placeholder in source P makes candidate X movable. Each move makes the next Pane in the cycle movable, until P's own Pane arrives and the placeholder is closed. A disjoint cycle stays blocked until then, so a second placeholder cannot be opened while one exists.
- **Final steps: correct.**
  - The final reveal uses `terminal.show(true)`, which does not change the active group. It awaits the tab in its cell and the tab becoming active (`:164-173`).
  - Focus comes last (`OpenTabFeature.ts:52`).
  - `focusEditorGroup` uses the direct First–Eighth commands, then `k − 8` sequential `focusNextGroup` commands, then the active-group predicate. There is no cap and no probing loop.
- **Descriptor and sizes: correct.**
  - Children are flattened one level per build: they are already flattened recursively, and a same-direction child's children are promoted (`tabLayoutTree.ts:56-59`).
  - Promoted children keep their extents along the shared axis, because they were built under a split of the same direction.
  - Root size is the documented sentinel `1` (`:62-63`).
  - Orientation: the root direction maps to `orientation` 0 or 1. Nested `{ size, groups }` relies on VS Code alternating orientation by depth, which flattening guarantees.
  - A single-Pane root becomes `{ orientation: 0, groups: [{ size: 1 }] }`, with no special branch.

## Verdict

Corrections needed. The behaviour and the scheduler are correct; the slice needs these changes:

1. **Feature:** remove the `disposed` flag and `ensureCurrentSession` (`OpenTabFeature.ts:10,21,28,44-59`). The error toast becomes unconditional again, and the captured `sessionId` is used as the other features use theirs.
2. **Manager:** remove `ensureAvailable`, the disposal check in `requireSurface`, the "Pane Editor was replaced" check, and the `requireSurface` calls inside probes and after awaits (`PaneTerminalSurfaceManager.ts:110,132,138,141,170,187,190,195-200,212-213`).
   - Keep a plain lookup that throws "Pane Editor is no longer open" where a surface is first needed.
   - `waitForPaneTab` probes `managed.tab`, with an optional column, without throwing.
3. **Waiter:** revert the try/catch in `waitForEditorGroups` (`src/core/editor-groups/index.ts:39-48`) to the HEAD form.
4. **Placeholder:** simplify it to the one tracked tab.
   - Drop `placeholderDocument` as state, the `findPlaceholder()` fallback in close, `if (!closed) throw`, `projectionFailed` and `cleanupPlaceholder`.
   - Close the placeholder in the loop, and in a `catch` that swallows only the cleanup error before rethrowing the primary error. The success path already ends with the placeholder closed.
5. **Recompute:** drop the redundant `current = await bindings()` after closing the placeholder (`PaneTerminalSurfaceManager.ts:159`).

After the changes, rerun typecheck, lint, format, `npm test` and `npm run test:extension`, with the same two expected failures.
<!-- end of reply -->
