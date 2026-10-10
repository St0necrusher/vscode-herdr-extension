# sol-impl-74-q1 — constructor seam and verification

## Summary

**Confirmed, with a verification qualification.** Preserve the mandatory `PaneEditorNavigation` seam; do not add test compatibility to production. Leave tests unchanged in this production slice. Report the cited fixture/type conflicts as design-forced test migration, not production defects. Direct esbuild/extension-host runs are permitted as supplemental runtime evidence, but do not count as passing typecheck, the normal build, or the standard extension-test command. The coordinator must resolve the outstanding test migration/acceptance gate; this answer does not waive it.

## Decision — explanation of the approved design

The approved architecture requires `VsCodePanesView` and `RevealPaneFeature` to consume `PaneEditorNavigation`; ordinary creation paths retain `PaneTerminalOpening`. An `openPane`-only double, or a value statically narrowed to `PaneTerminalOpening`, does not satisfy that new dependency. Runtime possession of a manager does not change its declared TypeScript type.

The request identifies these call sites: `test/extension/pane-command.test.ts:140`, `agents-navigation.test.ts:479–514`, `creation-commands.test.ts:301`, `management-commands.test.ts:357`, and `run-npm-script.test.ts:183`. These are worker-supplied evidence, not a fresh independent source audit. Capture the actual compiler diagnostics in the slice report to establish the exact affected sites.

`briefs/common.md` already allows another failure to be reported when the design forces it. Apply that provision here. The brief's “only two failures” inventory was incomplete: those are behavioral conflicts, not an exhaustive inventory of constructor-contract migration. Do not add optional navigation, fallback to `openPane`, a union dependency, casts, or weakened checking to preserve obsolete doubles.

## Verification and ownership

1. Continue the production adapter changes as designed. Test files remain outside your write boundary.
2. Run and record the normal validation commands. When the initial `&&` chain stops, run the remaining independent checks separately so their results are not silently omitted. Distinguish failed, passed, and blocked/not run. Classify actual diagnostics individually; unrelated failures are not excused by this decision.
3. You may invoke the existing esbuild entry directly and launch the existing extension-host runner against freshly built output, recording the exact commands and exit results. Do not modify build configuration, suppress TypeScript diagnostics, edit committed tests, or claim this is equivalent to `npm run test:extension` passing.
4. Transpilation does not repair an `openPane`-only runtime double. Any resulting missing-method/assertion failures must be reported separately from the two known Tab-switch expectations, with their fixture cause. A suite cannot be called green merely because fixture failures were expected.
5. The brief already authorizes a throwaway extension-host check for S2–S4. Use the real manager/new navigation seam there, record the ordering and terminal-identity evidence, then remove the temporary check as required. Existing fixture incompatibility does not waive this runtime gate.
6. Report the needed test updates to the coordinator/testing phase: provide correctly typed navigation dependencies and navigation-capable doubles for navigation consumers, while preserving `openPane` for creation consumers. Changes to test expectations or asynchronous assertions belong to that phase as needed; they must not be smuggled into production.

**Acceptance boundary:** this production slice can be submitted for review with precisely documented design-forced fixture conflicts. It cannot be described as satisfying the brief's all-checks-passing completion criterion. The coordinator owns reconciliation of the brief and authorization of a bounded fixture migration; normal typecheck/build/test gates remain outstanding until that work is done. No product behavior or approved architecture changes here.

Recorded in `progress.md`. No new domain terms, ADR, source edits, or test edits introduced by this answer.

<!-- end of reply -->
