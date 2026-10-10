from: claude-main (Claude Code, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/recreate-2.md
skills: implement-slice
input: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/recreate-1.md, /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reviews/recreate-1.md (slice review)

# Slice `recreate`, round 2: remove the guards

The behaviour and tests are accepted. Apply the review's correction 1 exactly: in `PaneTerminalSurfaceManager.ts` remove the `requireCurrentSurface` calls (:93, :114, :121, :133, :135), the `disposed` checks (:102, :111) and the `requireCurrentSurface` helper (:125-127); `focusPane` returns to its HEAD form. Why: the owner rejects re-checks after every await and mid-operation disposal checks as guards against unrealistic cases; the first round of this feature removed exactly these. Also apply the review's two optional comment fixes.

Validation: typecheck, lint, format:check, npm test, test:extension once. Short report (summary ≤ 20 lines), last line exactly `<!-- end of reply -->`, then a one-line final message.
