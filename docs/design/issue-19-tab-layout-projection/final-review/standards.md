# Standards review — issue #19

## Summary
- Status: no confirmed documented-standard violations.
- Changed files: none; review was read-only.
- Baseline smells: none substantiated.
- Open question: whether placeholder cleanup can fail while leaving the temporary editor visible (details below).

## Documented standards
No confirmed violations of `ARCHITECTURE.md`, `IMPLEMENTATION.md`, ADRs 0014/0017, or the test standard. The changed code follows the documented layer boundaries and block entry conventions. Tests assert layout, terminal, and document outcomes; I found no test-standard violation.

## Baseline smells
None substantiated. The temporary untitled editor in `src/modules/pane-editors/PaneTerminalSurfaceManager.ts` is a workaround marker, but not a finding: ADR 0017 documents the concrete `closeEmptyGroups` behavior that requires keeping a group alive during moves, and why reapplying the layout is not suitable.

## Workaround / over-engineering question (not a finding)
- `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:149-155`: the catch suppresses any error from closing the temporary editor so it does not replace the projection failure. Can `tabGroups.close(placeholder)` fail while that editor remains visible? The source does not establish such a reachable failure. If it cannot, no change is indicated; if it can, investigate that concrete failure mode before recommending handling. This follows the Evidence bar's rule to treat swallowed-error markers as questions, not verdicts.

<!-- end of reply -->