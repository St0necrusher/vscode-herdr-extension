from: claude-coord-74 (claude, Herdr pane w3:p7K)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/reports/production-2.md
skills: implement-slice

Round 2 of slice `production`. Inputs: your report reports/production-1.md and the slice review reports/review-production-1.md (read its "Workarounds and over-engineering" section). Apply exactly these two corrections; nothing else changes:

1. `src/modules/pane-editors/PaneTerminalSurfaceManager.ts` `closePaneEditors`: drop the `if (managedPanes.length > 0)` wrapper and keep the body flat. VS Code 1.141 `tabGroups.close([])` resolves `true` without IPC, so an empty member list passes through unchanged.
2. `src/views/sidebar/panes/VsCodePanesView.ts` `herdr.openPane` handler: restore HEAD's early returns (`if (typeof paneId !== "string") return; const request = …; if (request === undefined) return;`) and wrap only the awaited `navigateToPane` in try/catch. `RevealPaneFeature.ts` stays as is.

Validation: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (record each result; the typecheck/lint fixture diagnostics from round 1 are expected and unchanged), and rerun the supplemental `node esbuild.mjs && npx vscode-test --config .vscode-test.mjs` to show the counts are unchanged. No test edits, no commits.

Write your complete reply as Markdown to the reply-to path: a summary of at most 20 lines first, details below. Its last line must be exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
