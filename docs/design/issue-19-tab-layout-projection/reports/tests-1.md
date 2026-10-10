# Tests slice, round 1

## Summary

- Status: scenarios 1–11 covered; all 18 projection tests passed in both final extension runs.
- Owned changes: `test/extension/tab-layout.test.ts`, `test/extension/tabLayoutFixtures.test.ts`, and this report only.
- Initial validation: typecheck exit 0, lint exit 1 (three test-code issues, corrected), format check exit 0, unit suite exit 0 (16 files / 156 tests).
- Initial extension runs: each exit 1; main suite 83 passing, fresh-window suite 0 passing / 1 known keyboard-focus failure, composition suite 1 passing.
- No production defects, unapproved design deviations, staging, commits, or branch changes.
- Final `npm run typecheck`, `npm run lint`, `npm run format:check`: each exit 0.
- Final `npm test`: exit 0; 16 files / 156 tests passed, including the shared-fixture pure-rule consumer.
- Final `npm run test:extension`, twice: each exit 1; 83 main-suite passes, 1 composition pass, only the known fresh-window failure.
- `git diff --check`: exit 0. No projection flakiness observed in four total extension runs.
- Questions / needed changes outside the slice: none.

## Scope and implementation

The shared fixtures retain every pre-existing case and the production slice's accepted n-ary/size changes. Two literal fixtures were added: `2:1 split` (`tabLayoutFixtures.test.ts:106`) and `nine Panes` (`:124`). Their independent expected trees are consumed by the existing pure-rule tests; no production tree/descriptor algorithm supplies expected outcomes.

The extension file now has nine table-driven fixture tests and nine focused behavioral tests. All drive the registered `herdr.openTab` command through the real `OpenTabFeature`, `PaneTerminalSurfaceManager`, `VsCodePaneTerminalSurface`, and VS Code editor APIs. The external Herdr projection/client boundary is fake. Starting editors are real pinned text documents; the surplus test uses a pre-existing dirty untitled document, explicitly preserved rather than mistaken for an operation-owned placeholder.

### Approved scenario mapping

| Scenario | Test name / location in `test/extension/tab-layout.test.ts` | Protected requirement |
| --- | --- | --- |
| 1 | `live 2x2 probe: projects the agreed shape and focuses the Tab's focused Pane` (table at :23) | One group becomes the literal live grid; every cell displays its Pane, and the Herdr-focused Pane is the focused editor. |
| 2 | `turns left/right file groups into top/bottom cells with files behind their Pane Editors` (:41) | Positional file preservation across a change of split direction. |
| 3 | `merges surplus groups into cell four in order without losing a dirty document` (:55) | Groups four and five append in order into the last cell; dirty document content and dirty tab/document state survive. |
| 4 | `creates trailing cells containing only their Pane Editors when two groups become four` (:83) | Existing groups keep their files; newly created cells contain only their assigned Pane Editors. |
| 5 | `fills before draining a lone misplaced Pane Editor and keeps its Terminal` (:94) | Moving a lone editor must not collapse the projected grid or replace its Terminal. |
| 6 | `resolves a two-Pane swap without replacing terminals or leaving a placeholder` (:107) | A blocked swap completes with identical Terminal objects and only the two intended tabs. |
| 7 | `projects literal 2:1 weights within pixel rounding without minimum-size clamping` (:141) | Literal 2:1 rendered weights, explicit 3px tolerance, and a smaller-cell width of at least 250px to rule out minimum-size clamping. |
| 8 | `repeating the Tab action preserves placement and every Pane Editor identity` (:157) | Same final grid, exact tab placement, and per-Pane reference identity on a repeated click; no focus/client-history comparison. |
| 9 | `moves a lone Pane Editor out of cell nine and focuses the Herdr Pane in cell nine` (:172), also `nine Panes` table case | The Herdr-focused Pane I ends in active group nine with I its active tab. |
| 10 | Same explicit cell-nine test (:172) | Pane A starts alone in source column nine and ends in cell one, with the same Terminal; exercises source activation beyond eight separately from final focus. |
| 11 | `resolves two disjoint swaps beside an unaffected file-bearing cell` (:121) | `[B]|[A]|[D]|[C]|[file,E]` resolves into the nine-cell grid with A–E Terminal identities retained, the file still in cell five, and no placeholder left. |

The inexpensive shape table remains for `single`, `right`, `down`, mixed nestings, flattened `nested right`, and the live probe, plus the two new fixtures. Every focused test asserts literal final tab lists; these both exclude new operation-owned untitled resources and preserve pre-existing documents. The shape helper observes each cell's active tab and the real editor layout; it does not derive an expected layout from production code.

### Shared identity/resource assertions

`withLayout` (:193) captures every Terminal produced by the real surface factory and records terminal-close events before any operation. After every projection it asserts that each captured Terminal remains in `vscode.window.terminals`, was never closed, there is exactly one Terminal and one tab per Pane, and each Pane's tab is active in its cell. Moving and repeating scenarios additionally compare the named Pane's Terminal object by reference before/after.

The fake client boundary records the maximum simultaneously live clients per Pane throughout the operation (fixture terminal IDs equal their Pane IDs). Stop is idempotent and completes the fake client's promise. The maximum must be at most one; clients may stop/restart and titles may flicker during moves. No client counts, uninterrupted-client assertions, private methods, test-only production exports, or OS keyboard-focus assertions were added.

The existing cleanup discipline is retained: dispose feature/navigation/manager/focus/selection, revert and close dirty text editors, close all editors, and join groups. Setup uses a real temporary pinned document to activate any requested source column, including nine, then removes that exact setup tab after the Pane Editor opens.

## Validation evidence

Initial task `b577e6656` completed both extension runs. Each main suite passed 83 tests and composition passed one. Each fresh-window suite failed only:

```text
The first Pane Editor of a window > takes keyboard focus from the Panes View
Error: Timed out waiting for the Pane Editor to report keyboard focus
```

Initial lint found unnecessary optional chaining at the layout root (two errors) and an enum/number comparison in the test document helper. Both causes were corrected in the owned test file. Active-tab assertions and explicit per-Terminal reference assertions were also strengthened before final revalidation. These were test-authoring issues, not production defects; no test expectation was weakened.

Final task `b025063ba` completed the repository scripts, including the full unit suite (which reruns the shared-fixture `tabLayoutTree.test.ts`) and two sequential full extension-suite runs. Logs were inspected with bounded excerpts:

| Command | Exact final result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | Exit 0 | `/tmp/sol-tests-1-final-static.log` |
| `npm run lint` | Exit 0 | Same static log; no diagnostics |
| `npm run format:check` | Exit 0; all matched files use Prettier style | Same static log |
| `npm test` | Exit 0; 16 files / 156 tests passed | `/tmp/sol-tests-1-final-unit.log` |
| `npm run test:extension` (final run 1) | Exit 1; 83 main-suite passes, 0 fresh-window passes / 1 known failure, 1 composition pass | `/tmp/sol-tests-1-final-extension-1.log`; summary lines 337, 517–521, 706 |
| `npm run test:extension` (final run 2) | Exit 1; 83 main-suite passes, 0 fresh-window passes / 1 known failure, 1 composition pass | `/tmp/sol-tests-1-final-extension-2.log`; summary lines 341, 520–524, 709 |
| `git diff --check` | Exit 0 | Run after final validation |

All 18 projection tests passed on both final runs, including both cycle cases, both beyond-eight outcomes, and the explicit 2:1 proportion assertion. Across the two initial and two final extension runs, no projection flakiness or other unexpected failure was observed. Both final extension builds/typechecks succeeded. Their exit 1 is entirely attributable to the unchanged known fresh-window keyboard-focus failure named above. The harness-required background runner was used, as explicitly approved in `answers/astra-arch-4.md`; task terminal notifications were awaited and logs inspected. Prettier writes were limited to the owned files and this report.

No production mutation was used to claim historical regression detection. No meaningful projection failure was observed in the initial extension runs. The old additive-only assertion has been replaced with whole-grid behavioral expectations, as assigned.

## Limitations, questions, and domain review

- Optional deeper mixed-nesting coverage was not selected. Error notifications, editor multi-selection beyond the separately accepted readiness gate, auxiliary windows, locked groups, and user-input races remain excluded.
- The proportion test intentionally requires enough rendered window width to avoid clamping; a smaller editor area is an environmental blocker, not a reason to relax the ratio expectation.
- The known fresh-window keyboard-focus failure is outside this slice; it was left unchanged.
- No approved scenario was unwriteable at this seam. No production changes or other owned-file changes are needed.
- New domain terms: none. New hard-to-reverse decisions: none. Per `domain-modeling`, no CONTEXT entries or ADRs are proposed; this slice records tests for the already-approved design only.
- Continuation: worker `sol-tests`, this pi conversation; request `requests/sol-tests-1.md`.

<!-- end of reply -->
