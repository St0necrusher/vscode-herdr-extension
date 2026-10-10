# Production slice, round 2

## Summary

- Status: all five requested corrections and the final-reveal wait simplification applied.
- Behaviour, scheduler, tree, descriptor, and public seams remain unchanged.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run format:check`: exit 0; all matched files formatted.
- `npm test`: exit 0; 16 files / 154 tests passed.
- `npm run test:extension`: exit 1; build/typecheck passed; main suite 75 passed / 1 expected obsolete-policy failure; fresh-window suite 0 passed / 1 known focus failure; real-composition suite 1 passed.
- `git diff --check`: exit 0.
- No unapproved design deviations; corrections follow request `sol-impl2-2.md` and review `reviews/production-1.md`.
- Validation execution deviation: long suites used the harness-required background runner, rather than foreground, and their completed logs were inspected.
- Questions, blockers, and needed changes outside the slice: none; slice 2 still owns whole-grid extension coverage and the obsolete assertion.

## Corrections mapped to implementation

1. **Feature checks removed:** `src/features/open-tab/OpenTabFeature.ts:8-45` has no `disposed` state or `ensureCurrentSession`. Its catch unconditionally shows `Could not open Tab: <message>` using `errorMessage`. The captured Session identity flows through placement and focus without post-await rechecks.
2. **Manager checks removed:** `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:73-183` has no `ensureAvailable`, new disposal guard, replacement check, or lookup inside a probe/after an await. `requireSurface` is now a plain lookup and retains the existing `Pane Editor is no longer open` error; it is called only when a surface is initially needed by bindings, final reveal, or focus. `waitForPaneTab` reads `managed.tab` and the optional target column without throwing.
3. **Waiter restored:** `src/core/editor-groups/index.ts:29` retains the exact HEAD waiter implementation, with no try/catch around the probe. The approved `focusEditorGroup` addition remains unchanged. `git diff HEAD -- src/core/editor-groups/index.ts` shows only that addition.
4. **One tracked placeholder:** `PaneTerminalSurfaceManager.ts:78-157` keeps only `placeholder: vscode.Tab | undefined`. The untitled document is local to the blocked-move branch; its exact tab is identified once. The loop directly closes the tracked tab and clears it when the source holds its assigned Pane. A failure catch attempts to close only that exact tab, swallows only the cleanup error, and rethrows the primary failure. No placeholder-document state, close fallback, close-result guard, failure flag, cleanup wrapper, or `finally` remains.
5. **Redundant recompute removed:** no bindings recomputation occurs after closing the placeholder; recomputation following creation/movement remains.
6. **Final reveal simplified:** `PaneTerminalSurfaceManager.ts:140-148` calls `terminal.show(true)` and performs one bounded wait for the Pane's tab to be active in its assigned column. It no longer performs a separate binding wait followed by an active-tab wait.

The optional loop-style change was not made: the existing `for...of` deliberately performs sequential awaited commands, consistent with the standing iteration preference.

## Scope

Round 2 edited only:

- `src/features/open-tab/OpenTabFeature.ts`
- `src/modules/pane-editors/PaneTerminalSurfaceManager.ts`
- `src/core/editor-groups/index.ts`
- This assigned report.

Round 1's remaining four owned-file changes were retained without alteration. Existing manager reconciliation, resource-lifetime checks elsewhere, terminal factory, tree/fixtures, public exports, and other workers' files were untouched. No staging, commits, pushes, branch changes, ADR/CONTEXT edits, or new tests.

## Validation evidence

Final static validation ran from the repository root:

```text
npm run typecheck && npm run lint && npm run format:check && git diff --check
# exit 0
```

Prettier writes were limited to owned files and this report. Both test commands ran to completion:

- `/tmp/sol-impl2-round2-unit.log`: 16 passed files, 154 passed tests; `npm test` exit 0.
- `/tmp/sol-impl2-round2-extension.log`: VS Code 1.141.0; build/typecheck successful; main suite 75 passing / 1 failing; fresh-window suite 0 passing / 1 failing; real-composition suite 1 passing; `npm run test:extension` exit 1.
- Background task: `b2795561f`. Combined output: `.pi/tasks/01a12495-10ea-76b3-b819-0d95cc0c6f51-87047/b2795561f.output`.

### Exact expected failures

1. **`Tab layout projection > projects into the active cell of an occupied grid without changing the other cell`** (`test/extension/tab-layout.test.ts`, untouched). Its expected additive grid includes an extra visible `occupied-left.txt` cell. The new whole-grid projection shows `A` in that cell, with the file behind it. This is the obsolete-policy assertion assigned to slice 2.
2. **`The first Pane Editor of a window > takes keyboard focus from the Panes View`**. Error: `Timed out waiting for the Pane Editor to report keyboard focus`. This is the known unfocused-window exclusion.

No other test failed. The old suite still does not dynamically cover all new cycle, surplus, proportions, multi-selection, and beyond-eight scenarios; those remain slice 2's coverage, not a claimed result of this validation run.

## Questions / needed changes / continuation

None beyond the already assigned slice-2 test work. No new domain terms or hard-to-reverse decisions were introduced by these corrections, and no further CONTEXT/ADR entries are proposed. Coordinator-owned ADR reconciliation remains outside this slice.

Continuation: worker `sol-impl2`, current pi conversation; request `requests/sol-impl2-2.md`; previous result `reports/production-1.md`.

<!-- end of reply -->
