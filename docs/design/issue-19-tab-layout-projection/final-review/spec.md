# Spec-axis review — issue #19

## Summary
- **Production requirements:** no confirmed omissions or incorrect behavior found.
- **Scope creep:** none; the older additive/fallback criteria in issue #19 are superseded by the approved architecture.
- **Tests:** one minor gap in approved scenario 8: repeat-click focus is not asserted after the second action.

## Finding

### Minor — repeat-click test does not prove focus is preserved

Requirement: “Repeating the click on an already projected Tab ends in the same grid, terminals, visibility and focus” (`architecture.md:20`); verification scenario 8 says “Repeat click on a projected Tab changes nothing” (`architecture.md:143`). `test/extension/tab-layout.test.ts:155-166` performs two opens and checks shape, tab labels, and Terminal identities. The shared `openTab` assertions (`:331-349`) verify each Pane tab is active in its cell and check client/Terminal invariants, but neither checks the active group and focused Pane after the second open. A regression that leaves the wrong group focused on the repeat would pass. Add an assertion after the second call for the focused Pane's active tab and cell. The implementation currently calls `focusPane` on every invocation (`OpenTabFeature.ts:43-44`), so this is a coverage gap, not an observed production defect.

## Execution trace (no production defect found)

- **5 groups → 4 cells:** `setEditorLayout` runs before placement; VS Code's ordered reuse/merge leaves group 5's editors after group 4's. The manager places the Pane Editors and tests assert order and dirty contents (`PaneTerminalSurfaceManager.ts:73-96`; `tab-layout.test.ts:55-79`).
- **2 groups → 4 cells:** the layout creates trailing groups; missing Pane Editors open at their indexed columns, while existing file tabs remain behind the Pane Editors (`OpenTabFeature.ts:41-43`; `tab-layout.test.ts:83-91`).
- **Already-open Pane Editor:** in the test's three-cell layout, C starts alone in cell 1; after A is created there, C is selected as a safe move, revealed, moved to cell 3, and awaited (`PaneTerminalSurfaceManager.ts:95-124`; `tab-layout.test.ts:94-104`).
- **Cycle `[B]|[A]`:** the placeholder holds A's source group; A moves to cell 1, then B to cell 2, after which the exact placeholder tab is closed (`PaneTerminalSurfaceManager.ts:97-138`; `tab-layout.test.ts:107-118`).
- **Beyond eight:** column 9 focuses Eighth then runs one `focusNextGroup`; the integration case starts with the source in inactive group 9 and checks the move and final focus (`editor-groups/index.ts:14-25`; `tab-layout.test.ts:170-190`).
- **Repeat:** already-correct Pane Editors are not moved again; active tabs are revealed and the requested Pane is focused (`PaneTerminalSurfaceManager.ts:95-96,140-168`). The only identified gap is the missing second-call focus assertion above.

<!-- end of reply -->