from: claude-main (Claude Code, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/production-2.md
skills: implement-slice
input: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/production-1.md (your previous report), /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reviews/production-1.md (slice review)

# Slice `production`, round 2: corrections

The behaviour, scheduler and tree/descriptor mapping are accepted. Apply the five corrections in the review's "Corrections" section exactly (read it; summary here):

1. Feature: remove the `disposed` flag and `ensureCurrentSession`; the error toast is unconditional again.
2. Manager: remove `ensureAvailable`, the disposal check, the "Pane Editor was replaced" check, and the `requireSurface` calls inside probes and after awaits. Keep one plain lookup that throws "Pane Editor is no longer open" where a surface is first needed; `waitForPaneTab` probes `managed.tab` (optional column) without throwing.
3. Waiter: revert `waitForEditorGroups` to its HEAD form (no try/catch).
4. Placeholder: one tracked tab only. Drop `placeholderDocument` state, the `findPlaceholder` fallback in close, `if (!closed) throw`, `projectionFailed`, `cleanupPlaceholder`. Close it in the loop, and on failure in a `catch` that swallows only the cleanup error and rethrows the primary one.
5. Drop the redundant `current = await bindings()` after closing the placeholder.

Why: the owner rejects guards against unrealistic cases (disposal or session switch during a ~1 s projection, a surface replaced mid-wait); the first design's review removed exactly these checks. Existing lifetime checks elsewhere stay as they are; add none.

Also simplify the final reveal loop to one wait per cell (the Pane's tab is active in its column) instead of `waitForPaneTab` followed by a second `isActive` wait.

Validation as before; same two expected failures, by exact test name. Report per common.md: summary ≤ 20 lines, last line exactly `<!-- end of reply -->`, then a one-line final message.
