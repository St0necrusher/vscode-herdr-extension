# Review: slice `tests`, round 1

## Verdict

**Corrections required (1 blocking, 1 minor).** Scenarios 1–9 and 11 are covered by tests whose literal assertions prove them. Scenario 10's test does not reach the behaviour it is named for: the source group beyond the eighth is already the active group when the move starts, so a break in source activation would pass. Scope, fixtures, the placeholder baseline and cleanup of editors, groups and dirty documents are correct. Validation was green twice, apart from the known fresh-window focus failure (`reports/tests-1.md:12-13, 63-71`).

## Scenario mapping (`test/extension/tab-layout.test.ts`)

| # | Test | Proves it? |
| --- | --- | --- |
| 1 | `live 2x2 probe` row of the fixture table, `:23-39` | Yes. Starts from one empty group (`withLayout` joins all groups, `:194-195`), checks the literal shape via each leaf's active tab (`:27`), checks that each cell holds only its Pane (`:29-36`), and checks the active group's active tab against the probe's focused Pane `p5Y` (`tabLayoutFixtures.test.ts:195`). That Pane is in cell 1, but the fill ends in cell 4, so the focus check does not pass by accident. |
| 2 | `turns left/right file groups into top/bottom cells…`, `:41-53` | Yes. Literal shape `{orientation: 1, groups: ["A","B"]}` and exact tabs `[["left.txt","A"],["right.txt","B"]]`. "Behind its Pane Editor" follows from the harness checking that each Pane is its cell's active tab (`:333`). |
| 3 | `merges surplus groups into cell four in order…`, `:55-81` | Yes. Exact tabs, with cell 4 = `["four.txt","five.txt","p50"]`, prove the order. Dirty state is checked on the document's contents, the document and the tab (`:75-79`). |
| 4 | `creates trailing cells containing only their Pane Editors…`, `:83-92` | Yes. Exact tabs `[["left.txt","p5Y"],["right.txt","p61"],["p5Z"],["p50"]]`. |
| 5 | `fills before draining a lone misplaced Pane Editor…`, `:94-105` | Yes. Pane C starts alone in group 1. If the Pane were drained before the fill, group 1 would close and the literal three-cell shape and exact tabs would fail. The test also checks the same `Terminal` (`:103`); the harness checks that no Terminal closed and that there is one Terminal per Pane. |
| 6 | `resolves a two-Pane swap…`, `:107-119` | Yes. The start state `[["B"],["A"]]` is asserted. The exact final tabs `[["A"],["B"]]` leave no room for a placeholder, and both Terminals are compared by reference. |
| 7 | `projects literal 2:1 weights…`, `:141-155` | Yes. Literal 2:1 within an explicit 3px tolerance, and a check that the smaller cell is at least 250px (VS Code's minimum group width is 220px), so clamping is ruled out. Equal weights would fail. |
| 8 | `repeating the Tab action preserves placement…`, `:157-170` | Yes, at the approved strength: final shape, exact tabs and per-Pane `Terminal` identity. As approved, it would not catch extra moves that end in the same placement. |
| 9 | `moves a lone Pane Editor out of cell nine…`, `:172-184` (also the `nine Panes` table row) | Yes, in the explicit test. Moving A into cell 1 leaves group 1 active, so focusing I has to activate group 9 (`:181-182`). The table row passes trivially, because the fill already ends in cell 9. |
| 10 | Same test, `:172-184` | **No (correction 1).** The test asserts A's identity and its final cell, but the move does not exercise source activation beyond the eighth group. `openPane("A", 9)` leaves group 9 active. The fill then opens I in cell 9, and `createTerminal` without `preserveFocus` activates that group. So when `placePanes` focuses A, group 9 is already active. **Missed break:** the move path could reveal A without activating its group first (for example `surface.terminal.show(true)` / `reveal()` in place of `focusPane` before `moveActiveEditor`), and the test would still pass. A break inside `focusEditorGroup` would still be caught, through scenario 9. Also, A is not alone in its group at move time (I has joined it), so "lone" in the name is inaccurate. |
| 11 | `resolves two disjoint swaps beside an unaffected file-bearing cell`, `:121-139` | Yes. `[B]\|[A]\|[D]\|[C]\|[keep.txt,E]` goes to exact tabs for nine cells, with `["keep.txt","E"]` unchanged in cell 5, identity checked for A–E, and no placeholder left. Two placeholder lifetimes run in sequence. |

The fixture-shape table (`:23-39`) keeps `single`, `right`, `down`, both mixed nestings, `nested right` → three columns, and the live probe, and adds the two new fixtures. Its expected values are the literal `shape` fields.

## astra-arch-4 corrections

1. **Maximum concurrent clients per Pane, throughout the operation:** `:255-277` records them at the fake boundary, keyed by `terminalId` (equal to the Pane ID). `:340-342` asserts at most one after every projection. The maximum covers the whole test, setup included. There are no start/stop counts and no continuity assertions. *Observation, not a correction:* the fake exits as soon as `stop()` is called, so a Pane counts as dead the moment it is asked to stop. The test would therefore miss an Attach restarted before the previous Attach's `stop()` resolves (dropping the `stoppingAttach` gate, `PaneTerminalSurface.ts:320,395`). This matches the repository precedent (`pane-editors.test.ts:27-55`) and how Gate 2 measured concurrent clients (`research/readiness-gates.md:39,114`), so it does not block the slice. Making exit asynchronous would be a separate question for the architect, because observer-to-attach handoffs already overlap (`releaseClient` uses `void observer.stop()`).
2. **Placeholder check through exact final tabs or a baseline:** every focused test asserts the exact `groupTabs()` (`:48, :69, :90, :102, :115, :132, :153, :163, :179`). The table asserts that every cell holds only its Pane (`:32-35`) and that every layout leaf is a Pane (`:27`). The dirty untitled `five.txt` from before the operation is preserved explicitly (`:62-79`), not rejected as a placeholder.
3. **Fixtures:** `tabLayoutFixtures.test.ts:106` (`2:1 split`, literal rectangles, ratio `2/3`, expected sizes 60/30) and `:124` (`nine Panes`, literal 3×3 rectangles and splits, focused Pane `I`). Existing fixtures are kept (the `generated` and probe changes are the accepted production-slice n-ary/size edits, `reports/production-1.md:22`). The pure-rule consumer was rerun with `npm test` (156 tests passed).

## Diff outside owned files

`git diff HEAD --stat -- test/ esbuild.mjs`: only `test/extension/tab-layout.test.ts` and `test/extension/tabLayoutFixtures.test.ts` changed. `esbuild.mjs` is unchanged. `src/modules/sessions/tabLayoutTree.test.ts` changed in the production slice (`reports/production-1.md:21`), not this one.

## Standards, fakes, harness, flakiness

- Seam: the registered `herdr.openTab` drives the real `OpenTabFeature`, `PaneTerminalSurfaceManager`, `VsCodePaneTerminalSurface` and VS Code editor APIs. Tests import only public block exports (`manager.openPane`, `paneTerminalOpenRequest`, `surface.terminal`). There are no private fields, test-only production exports or casts.
- Fakes: the client fakes honour `PaneObserver`/`PaneAttach`. `completion` resolves on `stop`, and `stop` is idempotent and resolves. The projection, window state and takeover offers are inert and match their interfaces. Monkeypatching `registerCommand` and `showErrorMessage` comes from the previous harness, is restored in `finally`, and lets a reported error fail the test (`:327`).
- Expected values: literal (shapes, labels, the 2:1 ratio, fixture IDs). No production tree or descriptor code supplies an expected value.
- Waits: no sleeps. `waitForEditorGroups` / `waitForPaneTitles` are bounded and poll observable end states.
- Harness size: `openPane` (a real pinned setup document activates a column beyond eight, then its exact tab is closed) and the shared post-projection invariants in `openTab` are proportionate. Nothing is over-engineered.
- Cleanup: editors, dirty documents and groups are cleaned up as before (`:359-378`). *Minor:* scenario 7 closes the sidebar and the panel (`:143-144`) and never restores them. Today this is harmless, because the other main-suite files use fake tree views. The bottom panel does not affect a left/right ratio.
- Flakiness: four extension runs showed no projection flake (`reports/tests-1.md:13,71`). Scenario 7 depends on the window being wide enough for a 250px smaller cell. The assertion reports that explicitly; it is an environmental failure, not a flaky one.

## Corrections

1. **Scenario 10 (blocking):** set up a start state in which group 9 is not the active group when the move begins and no new Pane is opened into cell 9. For example, in `:172-184`: `setGroups(9)`; `harness.openPane("I", 9)`; `harness.openPane("A", 9)` (cell 9 = `["I","A"]`); `executeCommand("workbench.action.focusFirstEditorGroup")`; wait until the active group's `viewColumn` is 1; then run `openTab`. Keep the literal final tabs `[["A"],…,["I"]]`, the A and I `Terminal` identities, and the final-focus assertions (active group `viewColumn` 9, active tab `I`). Rename the test so it does not claim a lone editor, e.g. "moves a Pane Editor out of cell nine into its cell and focuses the Herdr Pane in cell nine". Confirm in the report that the test still passes.
2. **Minor:** drop `workbench.action.closePanel` (`:144`). The bottom panel has no effect on a horizontal 2:1 ratio. Leave `closeSidebar`, which is needed for the 250px margin.

<!-- end of reply -->
