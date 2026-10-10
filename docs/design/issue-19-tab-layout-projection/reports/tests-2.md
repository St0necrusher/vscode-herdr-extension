# Tests slice, round 2

## Summary

- Status: both requested corrections applied; all 18 projection tests passed in both extension runs.
- Scenario 10 now starts with I and A in inactive group nine; both Terminal identities and the literal final grid/focus are asserted.
- Source activation is necessary on this path: the fill ends in group eight, while the misplaced A remains in group nine.
- The 2:1 test no longer changes sidebar or panel visibility. Both runs measured **697px / 349px**.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run format:check`: exit 0; all matched files formatted.
- `npm test`: exit 0; 16 files / 156 tests passed, including shared-fixture pure-rule tests.
- `npm run test:extension`, twice: each exit 1; main suite 83 passed, composition suite 1 passed, fresh-window suite 0 passed / 1 known focus failure.
- `git diff --check`: exit 0.
- No projection flakiness observed; no production mutation, design deviations, or questions / needed changes.
- Changed only `test/extension/tab-layout.test.ts` and this report in round 2; existing fixtures and other workers' changes preserved.

## Corrections and coverage

### 1. Inactive source beyond eight

`test/extension/tab-layout.test.ts:171-192` now names the behavior accurately:

**`moves a Pane Editor out of inactive cell nine and focuses the Herdr Pane in cell nine`**

Setup creates nine groups, opens I then A in group nine, asserts that group's exact starting tabs are `["I", "A"]`, then executes `workbench.action.focusFirstEditorGroup` and waits for the active group's column to be one before clicking the Tab. The final assertions still require the literal nine-cell shape and exact tabs `[["A"], ["B"], ["C"], ["D"], ["E"], ["F"], ["G"], ["H"], ["I"]]`. Both A and I must retain their original Terminal references. Group nine must end active with I its active tab. The shared harness continues to assert no Terminal closure, one Terminal/tab per Pane, active Pane tabs, and at most one simultaneously live client per Pane.

**Why the test fails without source activation (code-path reasoning, not a mutation claim):**

- A and I are already open, so the creation phase of `placePanes` (`PaneTerminalSurfaceManager.ts:78-85`) skips both of them. It creates only B–H, in target order, finishing in column eight; unlike round 1, it never creates a new I in column nine and thereby accidentally activates the source.
- A is the only misplaced Pane Editor and is safe to move because I remains in source group nine. The move branch at `:116-124` must activate A's actual source before executing `moveActiveEditor`.
- If that `focusPane` call were omitted, or replaced with a preserve-focus reveal (`terminal.show(true)`) without source activation, group eight would remain active. `moveActiveEditor` would move its active H, not A. The ensuing bounded wait for A in target column one would time out and the command's reported error would fail the harness's no-errors assertion. The exact final-tab assertions would also not be satisfied.
- With the real implementation, both runs passed. After A moves into cell one, final focusing of I independently exercises activation of column nine, preserving scenario 9 as well as corrected scenario 10.

No temporary production mutation was performed; the reasoning above follows the actual creation and move branches. Production files remained untouched.

### 2. Proportions without view-visibility leakage

`test/extension/tab-layout.test.ts:141-154` removes both `workbench.action.closePanel` and `workbench.action.closeSidebar`. Thus it changes neither view's visibility and needs no compensating visibility command or restoration assumption. The test logs measured widths so the environmental margin is inspectable.

Both full extension runs measured **697px / 349px** with sidebar and panel unchanged. The smaller group is 349px, above the unchanged 250px assertion and VS Code's 220px minimum noted in the review. `abs(697 - 2 × 349) = 1px`, within the unchanged explicit 3px rounding tolerance. No ratio or minimum-space assertion was relaxed.

## Validation evidence

Task `b6a28b8b7` used the required background runner, awaited terminal completion, and its logs were inspected with bounded excerpts. Both extension builds/typechecks succeeded.

| Command | Exact result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | Exit 0 | `/tmp/sol-tests-2-static.log` |
| `npm run lint` | Exit 0; no diagnostics | Same static log |
| `npm run format:check` | Exit 0; all matched files use Prettier style | Same static log |
| `npm test` | Exit 0; 16 files / 156 tests passed | `/tmp/sol-tests-2-unit.log` |
| `npm run test:extension` (run 1) | Exit 1; 83 main-suite passes, 0 fresh-window passes / 1 known failure, 1 composition pass | `/tmp/sol-tests-2-extension-1.log`; widths at :244, corrected source test pass at :256, summaries :343, :523-527, :712 |
| `npm run test:extension` (run 2) | Exit 1; 83 main-suite passes, 0 fresh-window passes / 1 known failure, 1 composition pass | `/tmp/sol-tests-2-extension-2.log`; widths at :242, corrected source test pass at :254, summaries :341, :520-524, :709 |
| `git diff --check` | Exit 0 | Run after validation |

The only failure in each run was the unchanged, known unfocused-window exclusion:

```text
The first Pane Editor of a window > takes keyboard focus from the Panes View
Error: Timed out waiting for the Pane Editor to report keyboard focus
```

No other test failed and no projection flakiness was observed. Prettier writes were limited to the owned test file and this report. The scenario coverage and exclusions in `reports/tests-1.md` otherwise remain unchanged.

## Questions / needed changes / domain review

None. No new domain terms or hard-to-reverse decisions were introduced; no CONTEXT entries or ADRs are proposed. No staging, commits, pushes, branch changes, production edits, or edits to other workers' files.

Continuation: worker `sol-tests`, this pi conversation; request `requests/sol-tests-2.md`.

<!-- end of reply -->
