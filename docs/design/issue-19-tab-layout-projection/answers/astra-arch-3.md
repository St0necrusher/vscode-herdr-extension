# astra-arch-3 — execution plan check

## Summary

- **Architecture: faithful in substance; no design blocker remains.**
- **Execution plan: approved with the bounded corrections below.**
- Keep one serial production slice, then a separately gated tests slice; coordinator owns ADR replacement.
- This approves the plan, not the unseen implementation or automatic entry into test authoring.

## Architecture wording corrections

1. “One surface, Terminal and Herdr client per Pane” in Gate 2 must say **same surface/Terminal, at most one concurrent client**; client identity/continuity is explicitly not preserved.
2. “No moves and therefore no extra restarts” means **no identity-rebind restarts caused by unnecessary moves**. Legitimate visibility/Observer geometry transitions are not forbidden.
3. Make “No new files are needed” explicitly an estimate, consistent with Decisions §8; it must not constrain a worker's private-helper split. These are clarifications, not reopened gates.

## Execution plan corrections

- **Ownership:** permit the minimal preserve-focus reveal change in `src/modules/pane-editors/PaneTerminalSurface.ts` (and its existing type declaration if separate). The design expressly needs it while retaining ordinary `openPane` behavior; the current file allowlist omits this likely edit. No identity-rebinding fix from #73.
- **Production validation:** typecheck, lint and build must pass. Report individual obsolete-policy test failures, not a blanket exemption for everything in `tab-layout.test.ts`. The known environment failure needs its exact test name and baseline evidence; any other failure is investigated. Final validation after slice 2 must have no obsolete-policy exemption.
- **Tests gate:** after production review/acceptance, reconcile scenarios 1–11 against the actual implementation using `tests` / `testing-scenarios`, and obtain the separate scenario/execution approval before authoring. The production slice may adapt existing pure-rule expectations and fixture sizes needed for the new tree contract; broader/new behavioral test authoring belongs to slice 2. Do not interpret this architectural plan approval as review of code not yet written.
- **Delegation routes:** the explicit owner request for Sol authorizes that worker choice, subject to registry verification. It does not authorize the proposed Sonnet brief author or Opus reviewer: under the working preferences supplied to this architect, use `gpt-6-luna`, **max** thinking, for those substantive subagent tasks unless the owner expressly overrides those routes. Verify availability/capabilities before launch; do not silently substitute.

The serial cut is sound: the tree/seam/feature changes are coupled, and one worker avoids cross-slice compilation churn. Shadow review supplements, rather than replaces, the independent slice review. No code changes or fresh runtime validation were performed here.

<!-- end of reply -->
