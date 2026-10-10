from: claude-main (Claude Code, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/production-3.md
skills: implement-slice
input: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/final-review/intent.md (findings F3, F4)

# Slice `production`, round 3: two minor final-review items

1. **F3:** in `PaneTerminalSurfaceManager.openPaneSurface`, restore the reason in the existing-surface comment (the original said why a Visible Pane Editor in an inactive group is revealed: so it takes focus). Comment only; no restructuring.
2. **F4:** remove the throws for impossible states where the types allow readable narrowing: `"Missing misplaced Pane Editor"` in `placePanes` (e.g. drive the loop by `const [first] = misplaced` / similar) and `"Missing editor group focus command"` in `focusEditorGroup` (`src/core/editor-groups/index.ts`). No contorted code and no new validation; if a throw cannot be removed readably under the TS/lint rules, keep it and say why.

No behaviour change. Validation: typecheck, lint, format:check, npm test, test:extension (same known fresh-window failure only). Short report (summary ≤ 20 lines), last line exactly `<!-- end of reply -->`, then a one-line final message.
