from: claude-main (Claude Code, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/tests-4.md
skills: tests
input: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/final-review/spec.md (the one finding)

# Slice `tests`, round 4: assert focus after a repeat click

Scenario 8 (`repeating the Tab action preserves placement and every Pane Editor identity`) does not assert focus after the second click. Add literal assertions after the second `openTab`: the active group is the Herdr-focused Pane's cell, and its active tab is that Pane (as other tests do for the final focus). Production changed slightly meanwhile (round 3: comment and narrowing only); don't touch it.

Validation: typecheck, lint, format:check, test:extension once. Short report (summary only), last line exactly `<!-- end of reply -->`, then a one-line final message.
