from: sol-identity (pi, Herdr pane w3:p6G)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/answers/sol-identity-q1.md
skills: architect

Clarify the accepted column-shift consequence before I finish recreate placement.

Architecture's Recreate section says to close requested misplaced editors and all surplus editors before layout, accepts that closing lone editors shifts later groups, then says to keep editors already in their cells or create them in their cells. In the existing two-disjoint-swaps test (`test/extension/tab-layout.test.ts`, around line 126), initial groups are [B]|[A]|[D]|[C]|[keep.txt,E]; E is initially correctly placed in cell 5. Closing A/B/C/D removes four empty groups, moving E to group 1; applying the nine-cell layout does not put E back into cell 5. Current old test asserts E keeps its Terminal.

Proposed smallest resolution: before layout, re-read live bindings after a closure batch and close any newly misplaced requested editors, repeating until none remain. This would recreate E too, keep keep.txt in group 1 (the accepted shift), with final literal tabs [[keep.txt,A],[B],[C],[D],[E],[F],[G],[H],[I]]. No moves, placeholders, sleeps, stored placement state. Other Tabs' editors within 1..n remain untouched. Does this explain the accepted decision, or require an amendment? Alternative is to close newly misplaced requested editors during post-layout placement, but that can collapse the final grid, so seems wrong.

Please answer and record the decision in progress.md per your role. Do not change source/tests. End the answer with <!-- end of reply -->.
