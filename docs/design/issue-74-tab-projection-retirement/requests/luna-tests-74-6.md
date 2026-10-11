from: claude-coord-74 (claude, Herdr pane w3:p7K)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/reports/tab-projection-5.md
skills: tests

Round 5 of slice `tab-projection`. Input: the slice review /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/reports/review-tab-projection-1.md (note N1).

One correction: the deleted test "returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13" contained a still-valid step — projecting Tab 13 over a projected Tab 12 (four cells into two). Add that direction under D5: `withLayout(tab12, …, [tab13])`; `openTab("w3:t4Z")`; declare its four members closed; `openTab("w3:t40")`; expect shape `{ orientation: 1, groups: ["p6D", "p6E"] }`, `groupTabs()` = `[["p6D"], ["p6E"]]`, the four Tab 12 Terminals closed, and the active tab as the old test asserted for Tab 13 (take the focused Pane from the fixture). Either as its own test or as a second step of the existing "a Tab navigation click retires the previous Tab Projection" test — pick whichever reads better.

Also mention in the report the active-tab wait you added to the shared postconditions (review N3) and why. No other changes. Run the full validation and report exact counts.

Write your complete reply as Markdown to the reply-to path: summary of at most 20 lines first, details below. Last line exactly `<!-- end of reply -->`. Then a one-line final message.
