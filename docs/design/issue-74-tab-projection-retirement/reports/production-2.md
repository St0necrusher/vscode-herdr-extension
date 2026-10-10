# Production slice #74 — round 2

## Summary

- Status: both requested corrections applied; no other production changes in this round.
- Changed: `PaneTerminalSurfaceManager.ts` and `VsCodePanesView.ts`; `RevealPaneFeature.ts` left unchanged.
- `npm run typecheck`: exit 2, same 10 obsolete navigation-fixture diagnostics as round 1.
- `npm run lint`: exit 1, same single Pane-command fixture unsafe-argument diagnostic.
- `npm run format:check`: exit 0, all matched files formatted.
- `npm test`: exit 0, 16 files / 158 tests passed.
- `node esbuild.mjs && npx vscode-test --config .vscode-test.mjs`: exit 1; counts unchanged.
- Extension: 84 passing / 3 failing; fresh-window: 0 passing / 1 failing; composition: 1 passing.
- Same four failures: two obsolete Tab-switch expectations, the openPane-only Pane-command double, and the fresh-window focus timeout.
- Normal acceptance remains blocked by the previously documented fixture migration; no new failures or design deviations.
- No tests, architecture/domain documents, other source files, commits, staging, pushes or branch changes in this round.
- Questions: none; existing coordinator/testing-phase follow-ups from round 1 remain.

## Corrections and evidence

Inputs: `requests/sol-impl-74-2.md`, `reports/production-1.md`, and the “Workarounds and over-engineering” section of `reports/review-production-1.md`.

1. **Flatten the shared close helper.** `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:118–128`: removed only the `if (managedPanes.length > 0)` wrapper and unindented its existing body. Both sequential binding/deregistration loops and the close-refusal error remain unchanged. Empty input now reaches `tabGroups.close([])` directly, following the reviewer-provided VS Code 1.141 no-IPC/success contract. No alternative empty-input guard added.
2. **Restore the Pane-command early returns.** `src/views/sidebar/panes/VsCodePanesView.ts:55–64`: returns early for a non-string ID and for an undefined request; only the awaited `navigateToPane(request)` is wrapped in try/catch. Mandatory navigation and canonical `Could not open Pane: <message>` reporting remain unchanged.

`src/features/reveal-pane/RevealPaneFeature.ts` was not edited. Neither membership logic nor the editor-group ordering flow was otherwise changed. The round-1 real-host S2–S4 ordering gate remains the existing evidence; it was not rerun or claimed as new verification in this round.

## Validation

Ran the four requested checks individually so expected failures did not skip later checks, followed by the supplemental host run. Full output:

`.pi/tasks/01a127c4-7b54-70af-b982-c50d64017436-4778/bab1eb55a.output`

| Exact command | Result |
| --- | --- |
| `npm run typecheck` | Exit 2; 10 diagnostics, all in unchanged test fixtures; no production diagnostics. |
| `npm run lint` | Exit 1; one unchanged test-fixture diagnostic, no production diagnostics. |
| `npm run format:check` | Exit 0; `All matched files use Prettier code style!`. |
| `npm test` | Exit 0; 16 files, 158 tests passed. |
| `node esbuild.mjs && npx vscode-test --config .vscode-test.mjs` | Direct esbuild successful; runner exit 1, counts/failure names unchanged. |

### Unchanged compiler and lint conflicts

- TS2345: `PaneTerminalOpening` lacks mandatory `navigateToPane` at `agents-navigation.test.ts:493,514`, `creation-commands.test.ts:313,334`, `management-commands.test.ts:369,390`, and `run-npm-script.test.ts:195,216`.
- `pane-command.test.ts:140`: TS2353 for its openPane-only literal and TS7006 for the now-untyped request parameter.
- Lint: `pane-command.test.ts:141:25`, `@typescript-eslint/no-unsafe-argument`, consequent to the same obsolete literal dependency.

These are precisely the round-1 diagnostics covered by architect answer `answers/sol-impl-74-q1.md`; no production compatibility or test edits were introduced.

### Supplemental extension-host counts and failures

VS Code stable **1.141.0**, Darwin ARM64:

| Runner configuration | Passing | Failing | Exit |
| --- | --- | --- | --- |
| `extension` | 84 | 3 | 1 |
| `fresh-window` | 0 | 1 | 1 |
| `composition` | 1 | 0 | 0 |
| Combined | 85 | 4 | 1 |

The same failure names and observed errors as round 1:

1. **“switches from real Tab 13 to Tab 12 while retaining the other Tab's Pane Editors behind it”** — `Timed out waiting for editor groups`; obsolete title-wait/retained-member expectations conflict with D5.
2. **“returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13”** — same timeout; obsolete expected-closed inventories and retained identities conflict with D5.
3. **“Pane command rereads connected and stale state, ignoring missing Panes and group headings”** — deep-equal failure, actual request list `[]` versus the expected pane-one request; unchanged openPane-only fixture cannot serve mandatory navigation.
4. **“The first Pane Editor of a window / takes keyboard focus from the Panes View”** — `Timed out waiting for the Pane Editor to report keyboard focus`. Round 1 separately reproduced this with the committed manager; this round did not repeat that baseline comparison or diagnose its cause.

The supplemental transpilation/host run is not a passing normal typecheck/build gate. `npm run test:extension` was not requested or rerun in this round; its round-1 build blockage remains until fixture migration.

## Scope and remaining acceptance

- `git diff --check`: passed after both corrections and after validation.
- `git diff --name-only -- test src/extension src/features/open-tab`: empty.
- Existing branch `feat/74-retire-tab-projection` preserved; prior worker/coordinator changes left intact.
- No new tests, throwaway checks, domain terms, hard-to-reverse decisions, CONTEXT proposals or ADR proposals in this correction round.
- Both requested corrections are complete. Normal acceptance still requires the coordinator-owned fixture/test migration and disposition of the reproduced baseline focus failure described in `reports/production-1.md`; no additional questions or blockers discovered.
- Continuation handle: ongoing worker `sol-impl-74`, pi Herdr pane `w3:p7M`.

<!-- end of reply -->
