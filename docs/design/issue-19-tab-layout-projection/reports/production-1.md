# Production slice, round 1

## Summary

- Status: implemented within the production slice's seven owned files; ready for coordinator/reviewer inspection, not feature acceptance.
- Whole-grid weighted projection, fill-before-drain placement, exact-tab cycle placeholders, preserve-focus visibility, and index-based focus are implemented.
- Existing terminal/surface ownership and `reconcileTabBindings` are unchanged; no terminal recreation for moves.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run format:check`: exit 0, all matched files formatted.
- `npm test`: exit 0, 16 files / 154 tests passed.
- `npm run test:extension`: exit 1; build/typecheck passed, main suite 75 passed / 1 expected obsolete-policy failure, fresh-window suite 0 passed / 1 known keyboard-focus failure, real-composition suite 1 passed.
- `git diff --check`: exit 0.
- Design deviations: none. Validation execution deviation: long test suites used the harness-required background runner rather than foreground; completed logs were inspected.
- Questions/blockers: none. Slice 2 must replace the obsolete additive-policy extension assertions and verify the additional whole-grid scenarios.
- No docs/ADRs/CONTEXT, other workers' files, tests outside the permitted files, branches, commits, or staging were changed.

## Changed files and requirement mapping

1. `src/modules/sessions/tabLayoutTree.ts:3-10,45-63`: n-ary readonly tree, per-node sizes, same-direction child promotion with each promoted child's original extent retained; root size is the documented unused sentinel `1`. Rectangle reconstruction remains independent of wire order and zoom.
2. `src/modules/sessions/tabLayoutTree.test.ts:7`: shared-fixture assertions now explicitly cover flattened directions and cell sizes.
3. `test/extension/tabLayoutFixtures.test.ts`: literal expected n-ary trees and weights for all seven existing cases. Nested right (`:99`) expects `A(11), B(11), C(21)`; the live 2x2 (`:109`) expects root widths 22/21 and child heights 16/15. A private binary source fixture represents the wire's original split rectangles, separately from the flattened expected tree. The existing `getEditorLayout`-shape format remains unchanged. No fixture additions were needed.
4. `src/core/editor-groups/index.ts:14`: public `focusEditorGroup(viewColumn: number)` uses direct First–Eighth commands, then exactly `k - 8` awaited `focusNextGroup` commands for later columns, followed by the active-group predicate. Numeric columns are annotated as `vscode.ViewColumn` without casts; VS Code supports runtime columns beyond its named enum constants.
5. `src/core/editor-groups/index.ts:29`: the existing bounded waiter also catches a throwing probe, clears its timeout/subscriptions, and rejects. This supports the new disposal/identity checks during event-driven waits without escaping event callbacks or leaving the waiter alive.
6. `src/modules/pane-editors/paneTerminalPlacement.ts`: `placePanes(requests)` replaces `openPaneInGroup`; array order defines target columns. Its existing public export in `index.ts` requires no change.
7. `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:48`: the existing opening path accepts the requested column, retaining the sole factory and ordinary `openPane` behaviour.
8. `PaneTerminalSurfaceManager.ts:73-180`: placement creates missing editors in their cells first and awaits binding; recomputes current tab bindings after every move/create; moves the first misplaced editor whose group has another tab; focuses and reveals the source Pane to isolate selection before `moveActiveEditor`. If all candidates would drain their source, it opens one pinned empty untitled document, identifies its exact text-document tab, and closes it when its source contains the assigned Pane. `finally` cleans owned temporary resources, including a tab created before a failed show/wait completes; the primary projection error wins over cleanup errors. No layout commands, session-module imports, or persistent placement store are added.
9. `PaneTerminalSurfaceManager.ts:167`: final cell visibility explicitly calls the owned terminal's `show(true)` and waits for the assigned tab to be active. No change to `PaneTerminalSurface.ts` is needed; ordinary reveal keeps its existing first-window focus behaviour.
10. `PaneTerminalSurfaceManager.ts:182-220`: final focus uses the Pane's actual bound group through `focusEditorGroup`, reveals the Pane, and awaits actual focused-tab state. Manager disposal and replaced/closed surface checks gate awaited binding work.
11. `src/features/open-tab/OpenTabFeature.ts:32-80`: builds requests from one snapshot in tree pre-order; maps sizes/nesting to the VS Code descriptor; awaits `setEditorLayout`, then the bounded group-count predicate, placement, and Herdr-focused Pane focus. Command completion is the barrier when group count stays unchanged. Disposal/current-Session checks prevent subsequent feature stages after lifetime changes. The notification retains `Could not open Tab: <message>` via `errorMessage`, with no rollback/retries.

Removed production references: `openPaneInGroup`, `project`, `firstLeaf`, `newGroupRight/newGroupBelow` projection, neighbour-focus navigation, binary `first/second` tree fields, and the eight-group-limit error. A search found only the unrelated setup `newGroupRight` command in the untouched extension test.

## Validation evidence

Commands were run from the repository root. Final static chain:

```text
npm run typecheck && npm run lint && npm run format:check
# exit 0; all three commands passed
```

`npx prettier --write` was restricted to owned files. Preliminary lint failures in new code (enum comparisons, rejection typing, and a throw directly inside `finally`) were corrected; the final static chain above passed. `npm test` and `npm run test:extension` were both run to completion, even though extension failures were expected.

Completed suite logs:

- `/tmp/sol-impl2-unit.log`: 16 test files passed, 154 tests passed.
- `/tmp/sol-impl2-extension.log`: VS Code 1.141.0; build/typecheck successful; main suite 75 passing / 1 failing; fresh-window suite 1 failing; real-composition suite 1 passing.
- Harness task `bc7134829`, full combined output: `.pi/tasks/01a12495-10ea-76b3-b819-0d95cc0c6f51-87047/bc7134829.output`.

### Exact failures

1. `Tab layout projection > projects into the active cell of an occupied grid without changing the other cell` (`test/extension/tab-layout.test.ts`, untouched): expects the superseded additive shape with `occupied-left.txt` as its own visible cell before `A`. Actual whole-grid shape correctly begins with `A`; the file remains behind its Pane rather than being an extra cell. This is the permitted slice-2 obsolete-policy conflict, not a production rollback requirement.
2. `The first Pane Editor of a window > takes keyboard focus from the Panes View`: `Timed out waiting for the Pane Editor to report keyboard focus`. This matches the assignment's known unfocused-window exclusion; no fix attempted.

The seven existing shape cases, terminal identity on movement, dirty-file preservation, repeated projection, and existing editor/composition lifecycle tests passed. The new swap/disjoint-cycle, surplus merge, weighted proportions, selection-isolation, and beyond-eight scenarios still require slice 2's observable extension tests; no claim that those were dynamically validated by this older suite.

## Questions / needed changes / limitations

- No unanswered architecture questions or required production edits outside this slice.
- Slice 2 owns the obsolete occupied-grid assertion and new whole-grid scenario coverage. No tests were weakened to obtain a pass.
- The accepted client restart/title-flicker limitation on a cross-group move remains: `reconcileTabBindings` is untouched.
- No new domain terms or hard-to-reverse decisions were introduced beyond the approved design. Per the architecture, no CONTEXT addition is proposed; coordinator-owned ADR 0017 reconciliation remains outside this slice.
- Continuation: worker `sol-impl2`, current pi conversation, assigned request `requests/sol-impl2-1.md`.

<!-- end of reply -->
