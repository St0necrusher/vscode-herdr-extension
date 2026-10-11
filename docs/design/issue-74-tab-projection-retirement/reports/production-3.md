# Production slice #74 — round 3

## Summary

- Status: approved I7 bound-only retirement implemented; settled Panel path reproduced before and verified after in real VS Code.
- Only source change: `src/modules/pane-editors/PaneTerminalSurfaceManager.ts`; no other production/test edits.
- Tab retirement skips unbound outside-request members without removing their membership.
- Pane navigation clears all membership first, then closes only bound former members other than its target.
- Unbound target handling remains unchanged; no Panel detector, terminal-disposal fallback or extra recovery branch.
- Before (`c989928`): 2/2 reproduction assertions passed, confirming unrelated Tab and first Pane navigation time out after a settled Panel move.
- After: 2/2 host checks passed; unrelated Tab layout and Pane opening succeed; the same Panel terminal stays alive.
- `npm run typecheck`: exit 2, same 10 test-fixture diagnostics.
- `npm run lint`: exit 1, same single test-fixture unsafe-argument diagnostic.
- `npm run format:check`: exit 0, all matched files formatted.
- `npm test`: exit 0, 16 files / 158 tests passed.
- Supplemental host run: exit 1, counts unchanged: extension 84 passed / 3 failed, fresh-window 0 passed / 1 failed, composition 1 passed.
- No new failures, unapproved deviations, commits, staging, pushes or branch changes; throwaway check/config/bundle removed.
- Normal acceptance still requires the previously documented test migration and baseline-focus disposition.
- Coordinator follow-up: record approved I7 in authoritative architecture/map and amend existing ADR 0018; proposal below. No new glossary terms.

## Approval and implementation

Inputs: `requests/sol-impl-74-3.md`, `reports/production-2.md`, F1 in `final-review/architecture-fit.md`, `final-review/answers-2.md`, and I7 in `map.md`.

The older architect answer/map describe I7 as unapproved/open. The newer round-3 request explicitly supplies the owner's **2026-10-11 approval** of this exact bound-only policy, including membership retention/rebinding and the unbound-target limitation. Implementation follows that approval; authoritative documentation remains coordinator-owned.

Base: `c989928`, branch `feat/74-retire-tab-projection`. Existing coordinator-owned working-tree changes were preserved.

### Changes mapped to the four requirements

1. **Tab retirement candidate** — manager line 112: `isRetiredMember` now additionally requires `managed.tab !== undefined`. No set mutation was added, so a skipped unbound member stays in the projection; if it later binds, ordinary subsequent Tab retirement can close it. Existing requested-pane misplacement and surplus-group logic remain unchanged.
2. **Pane navigation candidate** — lines 55–64: snapshot and `tabProjection.clear()` still precede all awaits. The former-member filter now selects only `managed !== target && managed.tab !== undefined`, using a named `shouldClose` boolean. Unbound members are skipped but already lose membership, as I3 requires.
3. **Unbound target** — lines 66–70: unchanged `wasMember` and bounded `waitForPaneTab(target)` path. No special unbound-target branch added. The scope is unrelated navigation, not healing #73 or making projections containing a requested unbound Pane work.
4. **Why comment** — line 58: `Unbound members may be in the Panel; retirement must not wait for their editor binding.` One new comment, avoiding a claim that unbound uniquely identifies the Panel.

No helper, adapter, type, export, constructor, event lifecycle or other production file changed. No disposal fallback, Panel detector, wait adjustment, queue or recovery state added.

## Real-host Panel verification

Host: VS Code stable **1.141.0**, Darwin ARM64. A temporary JS extension-host check used actual `PaneTerminalSurfaceManager`, `VsCodePaneTerminalSurface`, `PaneEditorSelectionModel`, `PaneEditorFocusTracker`, `NavigationContextModel` and `OpenTabFeature`, with controlled Herdr clients and a connected snapshot.

Each of the two checks created a **fresh manager/projection**:

1. Execute the real OpenTabFeature command for Tab A (right split A/B); assert editor groups `[["A"],["B"]]` and B is a member.
2. Focus B via the manager, verify it is the active terminal, execute `workbench.action.terminal.moveToTerminalPanel`.
3. Use the existing bounded host-state wait until B is the same managed object, its bound tab is undefined, the grid has one group, and its original terminal is still live. Assert settled groups `[["A"]]` before navigating. No arbitrary delay or artificial unbound surface used.
4. For the Tab case, click unrelated Tab B (down split C/D) via the real command. For the Pane case, call the real `navigateToPane` seam for C.
5. Assert the outcome and the original Panel terminal's managed/terminal identity, liveness, binding and membership. Private fields were inspected only in the deleted JS check; no production export or test seam added.

### Before: committed `c989928` behavior

Bundled the check **before editing the production file**, when the source working tree matched `c989928`, with `BASELINE=true`. The resulting bundle was frozen; subsequent edits did not alter that running baseline.

| Entry | Observed result | Panel B |
| --- | --- | --- |
| Unrelated Tab B | `Could not open Tab: Timed out waiting for editor groups`; layout never applied, groups remain `[["A"]]` | Same managed object/terminal, live and unbound, membership retained |
| Pane C | `navigateToPane` rejects `Timed out waiting for editor groups`; C never created, groups remain `[["A"]]` | Same managed object/terminal, live and unbound, membership cleared |

Runner exit 0, **2 reproduction assertions passing (11s)**. This means both expected regressions were observed, not that baseline navigation worked. Individual checks took 5317 ms and 5207 ms. Evidence:

`.pi/tasks/01a127c4-7b54-70af-b982-c50d64017436-4778/b70819a69.output`

### After: bound-only working tree

Rebundled the identical check with `BASELINE=false`, using the corrected manager.

| Entry | Observed result | Panel B |
| --- | --- | --- |
| Unrelated Tab B | No errors; groups `[["C"],["D"]]`, layout orientation 1 (down) | Same managed object/terminal, still live/unbound; membership retained |
| Pane C | Resolves; groups `[["C"]]`, bound former A closed and C opened | Same managed object/terminal, still live/unbound; membership cleared |

Runner exit 0, **2 passing (753ms)**; individual checks 472 ms and 226 ms. No post-navigation timeout occurred. The membership asymmetry is verified on the real Panel path, not inferred solely from code. Later re-entry/rebinding and clicking the unbound member itself were not separately exercised; their existing/approved source paths are unchanged.

Evidence:

`.pi/tasks/01a127c4-7b54-70af-b982-c50d64017436-4778/bb79637fa.output`

The log includes `PANEL_SETTLED` and `PANEL_RESULT` snapshots, and `PANEL_GATE_EXIT=0` before the supplemental suite.

### Exact reproduction commands

The temporary config used absolute repository extension/workspace/output paths, stable VS Code, `--disable-gpu`, and a 20-second Mocha timeout.

```sh
# Before production edit:
npx esbuild docs/design/issue-74-tab-projection-retirement/requests/sol-impl-74-panel-gate.test.mjs --bundle --platform=node --format=cjs --external:vscode --external:node-pty --alias:@core=./src/core --alias:@api=./src/api --alias:@modules=./src/modules --define:BASELINE=true --outfile=dist/sol-impl-74-panel-gate.test.js
npx vscode-test --config docs/design/issue-74-tab-projection-retirement/requests/sol-impl-74-panel-gate.config.mjs

# After production edit:
npx esbuild docs/design/issue-74-tab-projection-retirement/requests/sol-impl-74-panel-gate.test.mjs --bundle --platform=node --format=cjs --external:vscode --external:node-pty --alias:@core=./src/core --alias:@api=./src/api --alias:@modules=./src/modules --define:BASELINE=false --outfile=dist/sol-impl-74-panel-gate.test.js && npx vscode-test --config docs/design/issue-74-tab-projection-retirement/requests/sol-impl-74-panel-gate.config.mjs
```

The subsequent standard esbuild entry removed the temporary bundle, and both temporary source/config files were explicitly deleted after completion. No committed test/build configuration was edited.

## Requested validation

| Command | Exact result |
| --- | --- |
| `npm run typecheck` | Exit 2; same 10 test-fixture diagnostics, none in production. |
| `npm run lint` | Exit 1; same single test-fixture error, none in production. |
| `npm run format:check` | Exit 0; `All matched files use Prettier code style!`. |
| `npm test` | Exit 0; **16 files / 158 tests passed**. |
| `node esbuild.mjs && npx vscode-test --config .vscode-test.mjs` | Direct esbuild successful; host runner exit 1; counts unchanged. |

Checks were run individually so expected failures did not skip later checks. Shell commands ran as harness background tasks. Formatting used `npx prettier --write` only on the owned manager file.

Check evidence: `.pi/tasks/01a127c4-7b54-70af-b982-c50d64017436-4778/b8cad867e.output`; supplemental evidence: `bb79637fa.output` in the same directory.

### Unchanged fixture diagnostics

- TS2345 (`PaneTerminalOpening` lacks `navigateToPane`): `agents-navigation.test.ts:493,514`, `creation-commands.test.ts:313,334`, `management-commands.test.ts:369,390`, `run-npm-script.test.ts:195,216`.
- `pane-command.test.ts:140`: TS2353 for its openPane-only literal; TS7006 for request's lost contextual typing.
- Lint: `pane-command.test.ts:141:25`, `@typescript-eslint/no-unsafe-argument`, consequent to that fixture's type mismatch.

No new diagnostics beyond `reports/production-2.md`. Normal typecheck/build acceptance remains blocked; direct transpilation is supplemental evidence only.

### Unchanged supplemental host counts and failures

- `extension`: **84 passing / 3 failing**.
- `fresh-window`: **0 passing / 1 failing**.
- `composition`: **1 passing / 0 failing**.
- Combined: **85 passing / 4 failing**, runner exit 1.

Same names and errors:

1. **“switches from real Tab 13 to Tab 12 while retaining the other Tab's Pane Editors behind it”** — `Timed out waiting for editor groups`; obsolete retained-member/title-wait expectation conflicts with D5.
2. **“returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13”** — same timeout; obsolete expected-closed inventory and retained identities conflict with D5.
3. **“Pane command rereads connected and stale state, ignoring missing Panes and group headings”** — deep-equal failure, actual requests `[]` rather than pane-one; unchanged openPane-only double.
4. **“The first Pane Editor of a window / takes keyboard focus from the Panes View”** — `Timed out waiting for the Pane Editor to report keyboard focus`. Round 1 reproduced this with the committed pre-slice manager; this round did not rediagnose or repeat that separate baseline comparison.

## Scope, documentation proposals and remaining limitations

- `git diff --check` passed after implementation and final verification.
- `git diff --name-only -- src test` contains only `src/modules/pane-editors/PaneTerminalSurfaceManager.ts`; tests and all other source remain untouched.
- No commits/staging/pushes/branch changes. Pre-existing map/progress/final-review/coordinator artifacts were preserved.
- No new domain term: “Tab Projection” remains the existing term. No new CONTEXT glossary entry is proposed; binding/membership mechanics are not glossary material.
- This round applies the owner-approved I7 behavior, not a new independent architectural decision. **Coordinator documentation follow-up:** update the existing architecture/map to mark I7 approved and record the filters, retained Tab membership, clear-first Pane behavior and residual unbound-target limit. The read map still called I7 open/unapproved; the request is the newer approval record.
- Following `domain-modeling`, propose amending **existing ADR 0018**, not adding a separate ADR, with: “A member moved into the Panel remains open and does not obstruct unrelated navigation. Retirement skips members without a bound editor tab. A Tab click leaves such a member in the projection, so later navigation may retire it after it returns to the editor grid; a Pane or Agent click relinquishes its membership immediately. Opening an unbound member itself remains subject to the existing bounded binding wait (#73).” These authoritative documents are outside the worker's write boundary and were not changed.
- Accepted limitations preserved: no reliable Panel classification (all unbound candidates are treated alike), no #73 healing, no overlaps/queue/cancellation, and the existing timeout when a requested unbound member needs a binding. This patch does not claim that every Tab containing an unbound requested Pane can project successfully.
- No new design questions. Normal acceptance and test-fixture migration remain coordinator/testing-phase work, as in rounds 1–2.
- Continuation handle: ongoing worker `sol-impl-74`, pi Herdr pane `w3:p7M`.

<!-- end of reply -->
