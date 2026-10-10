# Production slice #74 — round 1

## Summary

- Status: production implemented and ordering gate passed; **normal validation/acceptance remains blocked by test migration**.
- Changed: six owned source files; no extension wiring, OpenTabFeature, tests, architecture, ADR or CONTEXT edits.
- `npm run typecheck`: exit 2, 10 diagnostics in obsolete navigation fixture dependencies only.
- `npm run lint`: exit 1, one consequent unsafe-argument error in the Pane-command fixture.
- `npm run format:check`: exit 0, all matched files formatted.
- `npm test`: exit 0, 16 files / 158 tests passed.
- `npm run test:extension`: exit 2 during build/typecheck; no host tests launched by this command.
- Supplemental direct esbuild + existing host runner: exit 1; extension 84 passed / 3 failed; fresh-window 0 passed / 1 failed; composition 1 passed.
- Existing behavioral conflicts: both named Tab-switch tests still expect retired editors to remain; both time out in the old title-wait harness.
- Additional fixture conflict: “Pane command rereads connected and stale state, ignoring missing Panes and group headings” has an openPane-only double.
- Additional fresh-window failure: “takes keyboard focus from the Panes View”; reproduced with the committed manager, so not attributed to this change.
- Real VS Code ordering gate: exit 0, S2/S3/S4 repeated three times, **9 passed** using the production manager and production surface.
- No additional host-state wait needed: groups and target group state were settled when the existing close-and-wait returned.
- Architect answer `answers/sol-impl-74-q1.md` confirms mandatory navigation seam and reporting fixture conflicts; it does not waive normal acceptance gates.
- No product-design deviations, new design questions, commits, pushes, branch changes, or retained throwaway checks.

## Contract and ownership

Assignment: `requests/sol-impl-74-1.md`, `briefs/common.md`, `briefs/production.md`, approved `architecture.md`.
Branch preserved: `feat/74-retire-tab-projection`.
Base HEAD: `88ecf0b61a4094920256c31e1de2b4abfce1d3dd`.

Pre-existing changes preserved: `CONTEXT.md`, untracked ADR 0018 and task-directory artifacts. The architect updated its own progress/answer during consultation; this worker did not edit those files.

### Changed files and public seams

1. `src/modules/pane-editors/PaneTerminalSurfaceManager.ts`
   - Implements `PaneEditorNavigation`; owns one window-wide `Set<ManagedPaneSurface>` (lines 19–28).
   - `navigateToPane` snapshots/clears membership before awaiting, closes other former members, reads the bound target's current group afterwards, recreates a lone member only while another group exists, then uses unchanged `openPane` behavior (54–67).
   - `closeDisplacedPanes` retains existing misplaced/surplus handling and adds members outside the requested Session/Pane pairs (94–116).
   - Private `closePaneEditors` is the shared bounded binding, VS Code close, refusal rejection and surface-deregistration wait (118–130). Refusal error is now `Could not close Pane Editors`, suitable for both paths.
   - `placePanes` adds only newly created/recreated managed surfaces, before waiting for their tab binding; retained surfaces keep membership (132–151).
   - Membership is removed on every existing surface-close path (222–227) and cleared on manager disposal (192–204).
2. `src/modules/pane-editors/paneTerminalOpening.ts`: exports the new mandatory async `PaneEditorNavigation` interface (12–15); `PaneTerminalOpening` unchanged.
3. `src/modules/pane-editors/paneTerminalPlacement.ts`: documents retirement and create-only membership in the existing placement seam.
4. `src/modules/pane-editors/index.ts`: publicly exports `PaneEditorNavigation`.
5. `src/views/sidebar/panes/VsCodePanesView.ts`: constructor consumes navigation; `herdr.openPane` awaits `navigateToPane` and catches errors with `Could not open Pane: ${errorMessage(error)}` (43–66). Imports canonical `@core/errors` and removes the former local formatter.
6. `src/features/reveal-pane/RevealPaneFeature.ts`: consumes navigation; Agent command awaits the async workflow, selects its Space first, and uses the same Pane error wording/canonical formatter (10–38).

No extension composition change was necessary: the existing manager already satisfies both constructors. `OpenTabFeature` and ordinary Create/Split/Create Space/npm `openPane` callers remain untouched.

## Completion-criteria mapping

| Criterion | Result / evidence |
| --- | --- |
| Navigation implemented/exported; both adapters await and report errors | Implemented at the locations above. |
| Displacement retires members outside requests; placement records created editors | Implemented in manager 94–151; seam comments updated. |
| Shared close-and-wait helper, no copy | Both navigation and displacement call manager 118–130. |
| Window-wide object identity; closes remove membership | Single set, existing `pane.moved` retargets the same managed object, common close path deletes it. |
| D6 / B5 non-navigation paths unchanged | No membership changes in `openPaneSurface`, no selection/focus-triggered retirement. |
| Verification gate | Passed in real VS Code, detailed below. |
| All normal checks pass except two listed tests | **Not satisfied**: design-forced test fixture migration and reproduced baseline focus failure, detailed below. Architect confirmed reporting rather than production compatibility. |
| Durable report | This file. |

## Verification gate: real editor-group ordering

Host: VS Code stable **1.141.0**, Darwin ARM64, real extension-host runner, main-window grid. The check asserted `workbench.editor.closeEmptyGroups === true` without changing settings.

A temporary JS extension-host check used the actual `PaneTerminalSurfaceManager`, `VsCodePaneTerminalSurface`, `PaneEditorSelectionModel`, and `PaneEditorFocusTracker`, with a connected fixed Session snapshot and controlled Herdr clients. No committed test was added or edited. To observe the exact boundary without a production seam, the temporary JS check wrapped the compiled instance's private close helper: it awaited the original helper, then immediately recorded the host groups, tab lists and active group before returning to navigation. The wrapper did not wait or alter ordering. Terminal identity was checked before/after navigation.

The three scenarios ran three times each. In S4, a three-cell placement first created A/B/D, then manually closed A to leave `[file][B][D]`, also exercising membership removal through the production PTY close path.

| Scenario | Host state immediately after closing other members | After optional target close | Final state and identity |
| --- | --- | --- | --- |
| S2 `[file B][D]`, click D | `[file][D]`, 2 groups, D active in column 2 | `[file]`, 1 active group | `[file D]`, new terminal; old terminal gone |
| S3 `[B][D]`, click D | `[D]`, 1 group, D active in column 1 | No target close | `[D]`, original terminal retained |
| S4 `[file][B][D]`, click B | `[file][B]`, 2 groups, B active in column 2 | `[file]`, 1 active group | `[file B]`, new terminal; old terminal gone |

All three repetitions observed the same ordering. No empty group remained at either close-and-wait boundary. Decision: retain the existing bounded wait; do not add a redundant group-absence predicate, delay, setting compensation, or extra state.

Exact successful command (temporary source/config now removed):

```sh
npx esbuild docs/design/issue-74-tab-projection-retirement/requests/sol-impl-74-real-surface-gate.test.mjs --bundle --platform=node --format=cjs --external:vscode --external:node-pty --alias:@core=./src/core --alias:@api=./src/api --alias:@modules=./src/modules --outfile=dist/sol-impl-74-real-surface-gate.test.js && npx vscode-test --config docs/design/issue-74-tab-projection-retirement/requests/sol-impl-74-real-gate.config.mjs
```

Result: exit 0; **9 passing (2s)**. Evidence log: `.pi/tasks/01a127c4-7b54-70af-b982-c50d64017436-4778/bb8c477b6.output`, including `ORDERING_REAL` and `FINAL_REAL` snapshots.

An earlier provisional custom-surface gate did **not** run: its nested runner config resolved the extension root to the requests directory and failed with missing `requests/package.json`. The successful gate corrected all config paths to absolute repository locations and used the actual production surface, not that provisional custom surface. All provisional/successful throwaway sources, configs and bundles were deleted afterwards.

## Normal validation

The requested chain was launched verbatim:

```sh
npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension
```

It stopped at typecheck (exit 2). Remaining commands were then executed individually, recording each exit code, as the architect instructed. Checks ran as harness background shell tasks, sequentially within each command group.

### Compiler and lint diagnostics

Typecheck: **10 diagnostics**, all in unchanged test fixtures:

- `agents-navigation.test.ts:493,514`: TS2345, `PaneTerminalOpening` lacks mandatory `navigateToPane`.
- `creation-commands.test.ts:313,334`: same TS2345.
- `management-commands.test.ts:369,390`: same TS2345.
- `run-npm-script.test.ts:195,216`: same TS2345.
- `pane-command.test.ts:140`: TS2353, openPane-only literal does not implement `PaneEditorNavigation`; TS7006, `request` loses contextual typing.

Lint: exit 1; one error at `test/extension/pane-command.test.ts:141:25`, `@typescript-eslint/no-unsafe-argument`, consequent to the invalid double's lost contextual typing. No production diagnostics were reported by either command.

`npm run format:check`: exit 0, `All matched files use Prettier code style!`.

`npm test`: exit 0; **16 test files / 158 tests passed**.

`npm run test:extension`: exit 2 because its build runs the same failing typecheck. **No extension-host counts are claimed for this standard command.**

Evidence logs: `b0c6a450f.output` (typecheck chain) and `bd986e3a7.output` (remaining checks) in `.pi/tasks/01a127c4-7b54-70af-b982-c50d64017436-4778/`.

## Supplemental existing extension-host run

Authorized by `answers/sol-impl-74-q1.md` as supplemental evidence, not a replacement for normal gates:

```sh
node esbuild.mjs && npx vscode-test --config .vscode-test.mjs
```

Direct esbuild completed successfully; host runner exited 1. Counts:

- `extension`: **84 passing, 3 failing**.
- `fresh-window`: **0 passing, 1 failing**.
- `composition`: **1 passing**, exit 0.
- Combined: **85 passing, 4 failing**.

### Existing-test conflicts

1. **“switches from real Tab 13 to Tab 12 while retaining the other Tab's Pane Editors behind it”** (`tab-layout.test.ts:200`). Observed failure: `Timed out waiting for editor groups`. The harness at 417–421 still counts p6D/p6E as live and waits for their titles after they have correctly retired. Its subsequent obsolete assertions at 216–218 expect `[p6D p69][p6E p6C][p6A][p6B]` and retained p6D/p6E terminal identity; D5 now requires only the clicked Tab's four members.
2. **“returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13”** (`tab-layout.test.ts:226`). Observed failure: the same timeout in the old title wait. It marks only the third/fourth Tab-12 terminals as expected closed (235), then expects first/second members to remain behind Tab 13 at 238–241 and be preserved on return (253–254), plus retained Tab-13 terminals (257–258). D5 retires all outside-request members rather than preserving those identities. The later old assertions are not reached in this run.
3. **“Pane command rereads connected and stale state, ignoring missing Panes and group headings”**. Observed deep-equal failure: actual requests `[]`, expected one `pane-one` open request. `pane-command.test.ts:140` supplies only `openPane`; the production command calls mandatory `navigateToPane`, catches the resulting missing-method error, and does not append through that old double. This is fixture migration, not a navigation compatibility requirement.

The other typed fixtures compiled through esbuild still passed their exercised runtime paths; this does not make their invalid TypeScript declarations acceptable.

### Fresh-window failure and baseline comparison

**“The first Pane Editor of a window / takes keyboard focus from the Panes View”** timed out waiting for the Pane Editor's keyboard-focus report. This test calls unchanged `manager.openPane`, not the new navigation seam.

To establish a comparison without changing source/tests, a temporary esbuild plugin loaded **only** `PaneTerminalSurfaceManager.ts` directly from `git show HEAD:src/modules/pane-editors/PaneTerminalSurfaceManager.ts` into a separate ignored bundle of the unchanged fresh-window test. Other dependencies and the host environment remained the same. No production source was reverted or replaced on disk.

```sh
node docs/design/issue-74-tab-projection-retirement/requests/sol-impl-74-baseline-fresh-build.mjs && npx vscode-test --config docs/design/issue-74-tab-projection-retirement/requests/sol-impl-74-baseline-fresh.config.mjs
```

Committed-manager comparison: exit 1, **0 passing / 1 failing**, same test and same `Timed out waiting for the Pane Editor to report keyboard focus` after 3 seconds. Evidence: `.pi/tasks/01a127c4-7b54-70af-b982-c50d64017436-4778/bac28f618.output`. This reproduces the failure without this slice's manager changes; its underlying cause remains unresolved and is not claimed to be diagnosed. Temporary comparison script/config/bundle deleted.

## Questions / needed changes / limitations

- **Coordinator/testing phase:** migrate navigation consumers' fixture dependency types and provide navigation-capable doubles; keep ordinary creation `openPane` dependencies separate. Repair `pane-command` contextual typing through the correct mandatory seam, not casts/any/fallbacks.
- **Coordinator/testing phase:** update both D5 Tab-switch expectations, expected-closed inventories, and obsolete retained-terminal identity assertions. Production tests remain unchanged by this worker.
- **Coordinator:** reconcile the brief's incomplete two-failure inventory with the architect's confirmed fixture migration; rerun normal typecheck/build/test gates after authorized test work. The production submission is not an all-checks-green acceptance claim.
- **Coordinator:** fresh-window focus failure reproduces with the committed manager in this environment; investigate separately or obtain a usable host-focus verification run. No unrelated production workaround was added.
- Runtime gate establishes S2–S4 ordering on the observed stable host, not every future VS Code release. Other planned new feature scenarios belong to the separately authorized testing phase.
- No additional unresolved product/design questions. No new domain terms or hard-to-reverse decisions beyond the already-approved Tab Projection/navigation seam; no further CONTEXT entry or ADR proposed. Existing coordinator-owned domain artifacts were left untouched.
- Final scope inspection: `git diff --check` passed; no test diff; only the six owned production files changed by this worker, plus this report and `requests/sol-impl-74-q1.md`. All throwaway verification artifacts removed. No staging/commit/push/branch switch.
- Continuation handle: ongoing worker `sol-impl-74`, pi Herdr pane `w3:p7M`.

<!-- end of reply -->
