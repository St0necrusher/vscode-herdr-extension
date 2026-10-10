# Slice 2 `tests`: extension tests for the whole-grid projection

Worker rules: `briefs/common.md`. Skills: `tests` (load it first). Design: `architecture.md`, "Verification plan" and "Accepted limitation". Slice 1 (`production`) is merged into the working tree before you start; read its report `TD/reports/production-1.md` (and later rounds) for the final seam names.

## Owned files

- `test/extension/tab-layout.test.ts` (rewrite for the new policy)
- `test/extension/tabLayoutFixtures.test.ts`: add explicit fixtures for a 2:1 split and a more-than-eight-Pane Tab (approved); keep existing fixtures intact because `src/modules/sessions/tabLayoutTree.test.ts` reads them, and rerun that pure-rule test.
- `esbuild.mjs` only if an extension-test entry changes.

No production changes. A production change you need goes in the report (Needed changes) with the failing evidence; do not make it, do not weaken a test to pass.

## What to write

Extension tests at the editor-group seam, in an unfocused window, using the existing harness in this file (`withLayout`, the fake Herdr snapshot and fake clients, the real `PaneTerminalSurfaceManager` and `OpenTabFeature`). Observe `vscode.getEditorLayout` shape, tabs per `viewColumn`, each cell's active tab, the focused tab and `vscode.window.tabGroups.activeTabGroup`. Literal expectations: spell out shapes, tab labels, and counts. Drive the production command (`herdr.openTab`) like the existing tests; build the starting editor state with real VS Code commands/documents (files, dirty files, `setEditorLayout`, opening Pane Editors through `manager.openPane`).

Scenarios ("Critical now", verbatim):

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

Also keep the table-driven check that each shared fixture's shape (`layoutCases`: `single`, `right`, `down`, mixed nestings, `nested right` → three columns, the live probe) is projected, if the new policy still makes it meaningful; the fixtures' `shape` field is the `getEditorLayout` format.

## Assertion rules

- Identity (assert): the same `vscode.Terminal` object per Pane before and after (compare `vscode.window.terminals` entries by reference), no terminal closed (`onDidCloseTerminal` never fires for a Pane Editor), no duplicate Pane Editor (one tab per Pane), no placeholder left (no new operation-owned untitled tab remains; pre-existing documents, including a dirty untitled one, stay: assert exact expected final tabs or a before/after baseline), and at most one simultaneously live Herdr client per Pane throughout the operation (record the maximum concurrently live clients per Pane at the fake client boundary).
- Do NOT assert uninterrupted clients, client start/stop counts, presence continuity, or stable titles during moves. The design accepts this limitation: "Tests assert identity, not uninterrupted clients or a stable title." Wait for the final state (the harness's `waitForPaneTitles` or a bounded poll on the observable end state) instead of asserting intermediates.
- Proportions: compare the group `size`s from `getEditorLayout` or the rendered ratio with a tolerance for pixel rounding; the expectation of the ratio itself is literal (2:1).
- Excluded (do not test): the error-notification path, VS Code's own merge/reuse beyond what scenarios 2–4 observe, private helpers, races with user input. No test that depends on OS window focus (the known fresh-window focus test elsewhere fails locally; leave it).
- Keep the existing helpers' cleanup discipline: tests must leave no editors, dirty documents or groups behind.

## Completion criteria

- Scenarios 1–11 each covered by at least one test, named by behaviour (scenarios may share a test; 9 and 10 may share the >8-Pane fixture but both outcomes are asserted). Scenario 11: two disjoint cycles plus an unaffected file-bearing group. Scenario 7: literal 2:1 weights with an explicit rounding tolerance and enough space to avoid minimum-size clamping. Scenario 8: compare final placement and identity, not focus or client history. In the report, name the requirement each test protects and any meaningful failure you observed; no production mutation is required.
- `npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension`, through your harness's required runner, awaiting terminal results and inspecting logs. Expected: all green except the known fresh-window focus test. Run the extension suite at least twice to expose flakiness; report any flaky test with evidence, do not paper over it with sleeps (use the bounded waiters).
- Report lists per scenario the test name, and any scenario that could not be written at this seam with the reason.

## Exclusions

No production changes, no ADR/doc edits, no changes to other test files.


Scenario approval and these corrections: `answers/astra-arch-4.md`. A production defect a test exposes goes back to the coordinator in the report; never weaken the expected behaviour.
