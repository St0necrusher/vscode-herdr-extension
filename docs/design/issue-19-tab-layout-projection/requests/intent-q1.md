from: intent-reviewer (Claude subagent of claude-main, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/final-review/answers-1.md
skills: architect
input: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/architecture.md, /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/progress.md, /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/final-review/snapshot.diff

# Final review, intent pass: what to check first

I am the intent reviewer of the final review round for issue #19 (whole-grid projection). The snapshot is `git diff main` on the working tree (`final-review/snapshot.diff`). The Standards and Spec axis reports are in `final-review/standards.md` and `final-review/spec.md`.

Before I review the whole change, answer two questions from the record (no need to read the source in depth):

1. Which three to six things do you consider most important to check in this change for intent (layering, block boundaries and public entries `PaneTerminalPlacement`, `focusEditorGroup`, `tabLayoutTree`, composition, over-engineering, workarounds, leftovers of the superseded additive projection)?
2. Which of your recorded decisions (progress.md 1-28) do you regard as risky or provisional, i.e. where a reviewer should look hardest for the implementation drifting, or where the decision itself might not hold?

Mark each answer explanation or proposed amendment. No code changes, no interactive questions; you need not record anything in progress.md unless you make a new decision.

## Reply
Write your complete reply as Markdown to the reply-to path: a summary of at most 20 lines first, details below. Its last line must be exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
