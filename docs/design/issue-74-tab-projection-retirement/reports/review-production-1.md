# Slice review: `production` (#74), round 1

## Summary

- **Verdict: corrections (2, both minor and style-level).** Behaviour, design fit and scope are sound; nothing reachable is wrong in the data flow.
- Every completion criterion is met in code. The exception is the "only the two listed tests fail" validation criterion. The extra failures are fixture conflicts the design forces (architect `answers/sol-impl-74-q1.md`), so this is a coordinator gate, not a worker defect.
- The `src` diff touches only the six owned files. `test/`, `src/extension/` and `OpenTabFeature` are untouched, and no throwaway gate files remain.
- `navigateToPane` follows steps 1–4 and readiness 2/3/5/7. D1, D5–D8, S1–S4 and B5 trace correctly, and the real-host gate covers S2–S4 ordering.
- The shared close-and-wait helper serves both close paths with no copy.
- Correction 1: `closePaneEditors` wraps its whole body in `if (managedPanes.length > 0)`. The branch is redundant: VS Code 1.141 `tabGroups.close([])` resolves `true`. It also departs from the file's early-return idiom.
- Correction 2: `VsCodePanesView` `herdr.openPane` turns the existing early returns into three nested blocks. The minimal change keeps the early returns and wraps only the await.
- Risk, for awareness only (design-deferred to #73, not a slice correction): a member moved to the Panel stays unbound. It makes every later Tab click time out until a Pane or Agent click clears the set.
- The worker classified the test failures correctly: 4 test files (8 sites) plus `pane-command` are design-forced fixture migration, two `tab-layout` tests are behavioural conflicts (D5), and the fresh-window focus failure reproduces with the HEAD manager.

## Completion criteria

| Criterion | Status | Location |
| --- | --- | --- |
| `navigateToPane` implemented and exported via `PaneEditorNavigation` | met | `paneTerminalOpening.ts:12-15`; `index.ts:5`; `PaneTerminalSurfaceManager.ts:22,54-67` |
| Both row adapters await it and show `Could not open Pane: <message>` with `errorMessage` from `@core/errors` | met | `VsCodePanesView.ts:2,55-66`; `RevealPaneFeature.ts:2,15-23,31-39` |
| `closeDisplacedPanes` closes members outside `requests` | met | `PaneTerminalSurfaceManager.ts:106` |
| `placePanes` records the Pane Editors it creates | met | `PaneTerminalSurfaceManager.ts:138-142`; the add happens before the binding wait at `:143`, as readiness 2 asks |
| Contracts documented in `paneTerminalPlacement.ts` | met | `paneTerminalPlacement.ts:4-5,8` |
| Shared close-and-wait helper, no copy | met | `closePaneEditors` `:118-130`, called from `:58,64,113` |
| Verification gate done and reported | met | report "Verification gate". S2/S3/S4 ran ×3 on a real 1.141.0 host with the production manager and surface. The existing wait already gives the ordering, so no wait was added. |
| Validation: only the two listed tests fail | **not met as written** | The extra failures come from the design (see "Test-failure classification"). The architect confirmed this does not waive the gate, and the coordinator owns the fixture migration. |
| Report per `common.md` | met | `reports/production-1.md` |

## Diff outside owned files

Empty. `git diff --name-only` lists `CONTEXT.md` (a design artifact, not the worker's) and the six owned `src` files. `git diff -- test src/extension src/features/open-tab` is empty. No throwaway gate sources, configs or `dist/sol-impl-74*` bundles remain. `TD/requests/` holds only request files. `npx tsc --noEmit -p .` reports no diagnostics outside `test/`.

## Tests and production bent to tests

Tests are untouched. Production is not bent to suit them: there is no optional navigation, no `openPane` fallback, no union seam and no cast. The worker kept the mandatory `PaneEditorNavigation` dependency, which is what the architect required. The gate check wrapped a private method at runtime inside a deleted throwaway JS harness, so no production seam was added for it.

## Correctness trace

**Tab click (B2), `closeDisplacedPanes` → layout → `placePanes`.**

- `isRetiredMember = targetIndex === -1 && this.tabProjection.has(managed)` (`:106`). Members of the clicked Tab stay (repeat click, D1).
- Members are matched by `(sessionId, paneId)`, so members from another Session retire too (I1).
- Members leave the set only through `handleSurfaceClosed` (`:223`). This is readiness 7: Tab retirement removes a member only on a successful close.
- A misplaced member is closed, then recreated and re-added by `placePanes`, which matches D1 "created or recreated".
- A non-member found in place is not added (D1).
- D5 (13 → 12 closes p6D and p6E) follows directly.

**`navigateToPane`, steps 1–4.**

1. `:55-57` takes the snapshot, clears the set and resolves `target` through `getSurface`, synchronously before any await (readiness 3 and 5).
2. `:58` closes former members other than `target` through the shared helper.
3. `:60-65` reads the target's tab via `waitForPaneTab` after the closes, then `tab.group.tabs.length` and `tabGroups.all.length` synchronously after that await, so nothing is cached across an await (readiness 3). "Something else" counts any other tab.
4. `:66` calls `openPane`. `openPaneSurface` reads `activeTabGroup.viewColumn` when it runs, so a recreated target lands in the active remaining group, and a bound hidden target is revealed rather than recreated (readiness 5).

**Scenarios.**

- **S1** `[file B][D]`, click B: D closes, B's group has 2 tabs, B is kept and revealed. Result `[file B]`.
- **S2** `[file B][D]`, click D: B closes. D is alone and there are 2 groups, so D is closed (its group goes) and recreated in `[file]`. Result `[file D]`.
- **S3** `[B][D]`, click D: B closes, only 1 group is left, D is kept.
- **S4** `[file][B][D]`, click B: D closes. B is alone and there are 2 groups, so B is recreated. Result `[file B]`.
- **Target sharing its group with a former member**, `[file][B D]`, click D: B closes, D is alone, D is closed and recreated in the active remaining group. This works because the group count is read after the close.
- **D7**: a non-member target opens after all members close.
- **D6**: `openPane` and `openPaneSurface` never touch the set (`:50-52,69-92`).
- **B5**: no new path.
- **I3**: the set is cleared before closing, so a survivor of a failed close becomes ordinary.
- **D2 / `pane.moved`**: the set holds object identity, and `handlePaneMoved` keeps the object (`:207-220`).
- **D3**: the set is in memory only and cleared on dispose (`:201`), next to the other cleared collections.

**Failure path.** A refused close throws `Could not close Pane Editors` (`:125`). A timeout rejects from `waitForEditorGroups`. Both adapters catch and report, and there is no fire-and-forget Promise. The changed error text is needed because the helper is now shared, and no test asserts the old text (`rg "displaced Pane Editors"` finds nothing).

**Gate evidence.** It is consistent with the trace. The worker read state at the exact boundary after the helper returned: S2 gave `[file][D]` and 2 groups, S3 gave `[D]` and 1 group, S4 gave `[file][B]` and 2 groups. No empty group was left behind, and terminal identity matched kept or recreated as expected in each case. Keeping the existing wait is justified.

**Risk, design-deferred, not a correction.** A member the user moves to the Panel stays unbound (`managed.tab === undefined` persistently; #73 lists "a move to the Panel").

- On the next Tab click, `closeDisplacedPanes` marks it `isRetiredMember`. `closePaneEditors` then waits in `waitForPaneTab` (`:122`) and times out after 5 s with `Could not open Tab: Timed out waiting for editor groups`.
- The Tab path removes members only on a successful close, so every later Tab click fails the same way. That continues until a Pane or Agent click clears the set (that click also times out once) or the user closes the terminal.
- Before this change the same timeout hit only a Tab that contained the unbound Pane.
- Readiness 5 explicitly assigns persistent orphans to #73 and prescribes the bounded binding wait for members, so the worker followed the design. If the coordinator thinks the "all Tabs" consequence is user-visible enough, it belongs on the map's B2 box or in #73, not in this slice.

## Standards and owner preferences

- Layers and imports are correct: `views` and `features` reach `@modules/pane-editors` and `@core/errors` through their index files.
- `PaneEditorNavigation` is a real cross-block dependency type, not a test seam.
- There are no casts, no `any` and no `#`.
- The local duplicate `errorMessage` in `VsCodePanesView` is replaced by the canonical one, which also serves `showTabMoveError` (`:110`) with the same behaviour. This is justified because the new import would otherwise clash, and the standard requires `@core/errors`.
- There is no flag soup, no queue and no disposal guard (readiness 8).
- Violations: corrections 1 and 2 below.

## Workarounds and over-engineering (Evidence bar)

1. **`PaneTerminalSurfaceManager.ts:119`, `if (managedPanes.length > 0) { … }` around the whole helper body.**
   - It is reached on every Pane or Agent click without a Tab Projection (`members` is empty at `:58`), but the branch changes nothing.
   - Shipped VS Code 1.141.0, `extensionHostProcess.js`, `tabGroups.close`: `let i=Array.isArray(n)?n:[n];return i.length?…:!0`. An empty array resolves `true` without an IPC call, and both loops are empty.
   - So the branch is redundant code, and it also replaces the file's early-return idiom (`:193,212,231`) with a body-wide nesting. Remove it.
2. **`VsCodePanesView.ts:55-66`, restructured early returns.**
   - HEAD had `if (typeof paneId !== "string") return; … if (request !== undefined) …`. The diff turned this into three nested blocks.
   - Only the final call needed to change, into an awaited `try`/`catch`. Keep the early returns: `if (typeof paneId !== "string") return; const request = …; if (request === undefined) return; try { await … } catch …`.
   - `RevealPaneFeature.ts:15-23` is fine as written: HEAD already used the `if (typeof paneId === "string") …` form there, and it matches `OpenTabFeature`.

No other markers:

- `placePanes`' `let managed` plus `if` (`:138-142`) is the minimal form the membership add needs.
- `const shouldClose = …; return shouldClose;` (`:107-108`) follows the named-condition idiom of `:98-100` and `:147-148`. Neutral, so not a correction.
- `wasMember`'s `target !== undefined` (`:60`) is needed for type narrowing.

## Test-failure classification

**Design-forced; the worker is correct.**

- In `agents-navigation.test.ts:493,514`, `creation-commands.test.ts:313,334`, `management-commands.test.ts:369,390` and `run-npm-script.test.ts:195,216`, a shared `createNavigation` fixture types its dependency as `PaneTerminalOpening` and passes it to `VsCodePanesView` and `RevealPaneFeature`. I checked `agents-navigation.test.ts:479-514` and `creation-commands.test.ts:300-336`.
- The design (architecture "Public seams", brief) requires these constructors to take `PaneEditorNavigation`, so the TS2345 errors follow necessarily.
- In `pane-command.test.ts:140`, the literal double has only `openPane`. That causes TS2353 and TS7006 at compile time, the lint error `no-unsafe-argument` at `:141`, and at runtime a missing `navigateToPane` caught by the adapter, which leaves `requests: []`. This is the same class of failure.
- None of these is a production defect. The fix is fixture migration in the testing phase, never a production compatibility seam.

**Behavioural conflicts.** The two `tab-layout.test.ts` tests encode the pre-D5 rule that the previous Tab's Pane Editors stay behind. Correctly reported.

**Fresh-window "takes keyboard focus from the Panes View".** The test constructs only `PaneTerminalSurfaceManager` and calls `openPane` (`test/extension-fresh-window/first-pane-editor-focus.test.ts:62-72`). The worker reran it against the HEAD manager and saw the same timeout. The comparison is valid because the manager is the only changed dependency, so the failure is not attributable to this slice. Its cause is still unknown and needs separate follow-up.

## Verdict

Corrections:

1. `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:119-129`: drop the `managedPanes.length > 0` wrapper and keep the body flat. Evidence above: `close([])` resolves `true`.
2. `src/views/sidebar/panes/VsCodePanesView.ts:55-66`: restore HEAD's early returns and wrap only the `await this.paneEditorNavigation.navigateToPane(request)` in `try`/`catch`.

Everything else is accepted as is. After the corrections the worker reruns `npm run typecheck`, `npm run lint` and `npm run format:check`; the same fixture diagnostics are expected and nothing else.

<!-- end of reply -->
