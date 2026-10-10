from: claude-main (Claude Code, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/tests-2.md
skills: tests
input: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/tests-1.md (your report), /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reviews/tests-1.md (slice review)

# Slice `tests`, round 2: corrections

1. **Blocking (review item 1):** the scenario 10 test (`tab-layout.test.ts:172-184`) does not exercise moving a Pane Editor out of a group beyond the eighth: group 9 is already active when the move starts, so dropping the source-group activation before `moveActiveEditor` would still pass. Make the source group inactive before the click, as the review proposes (e.g. I and A in cell 9 beforehand, then focus group 1, then open the Tab), keeping the literal end-state assertions. Confirm in the report that the test would fail without the source activation (reason from the code path; a temporary local mutation you revert is fine if you want evidence, but leave production unchanged).
2. **2:1 test (:141-144):** drop `closePanel` (no effect on a left/right ratio). The test also closes the sidebar and never restores it, which leaks into later extension tests (view visibility matters, ADR 0011). Restore the sidebar after the test (in the test's own cleanup), or drop the sidebar close if the ratio stays clear of minimum-size clamping without it — show the measured sizes.

Validation as before (both extension runs); report per common.md: summary ≤ 20 lines, last line exactly `<!-- end of reply -->`, then a one-line final message.
