from: claude-main (Claude Code, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/answers/astra-arch-4.md
skills: architect
input: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/architecture.md ("Verification plan"), /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/briefs/tests.md, /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/production-2.md

# Approve the test scenarios for slice `tests` (stands in for the owner)

The production slice is implemented as designed (slice review re-check in progress; I'll tell you if it changes anything relevant). Reconciliation of the preliminary verification plan against the implementation:
- No seam changed: `herdr.openTab` → `setEditorLayout` → `placePanes` → `focusPane`; observable at `vscode.getEditorLayout`, `tabGroups` (tabs per column, active tab per group, active group), terminal identity (`vscode.window.terminals`, `onDidCloseTerminal`) and the fake Herdr client count.
- Scenarios 7 (2:1 proportions), 9 and 10 (> 8 Panes) need new fixtures; the fixture generator halves every split, so the tests slice adds explicit fixtures in `test/extension/tabLayoutFixtures.test.ts`.
- Per the accepted limitation, identity assertions only: same `Terminal`, no close, at most one concurrent client; no assertions on uninterrupted clients or titles.
- Proposed critical set = scenarios 1–11 as in architecture.md, unchanged; optional "deeper mixed nesting" stays excluded (pure-rule tests over the shared fixtures cover the shapes). Excluded as before: error notification path, VS Code merge internals, private helpers (scheduler ordering is asserted only through outcomes), user-input races.

Approve the scenario list or amend it (add/remove/merge with reasons). Record the approval in `progress.md`. No code changes, no interactive questions.

## Reply
Write your complete reply as Markdown to the reply-to path: a summary of at most 20 lines first, details below. Its last line must be exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
