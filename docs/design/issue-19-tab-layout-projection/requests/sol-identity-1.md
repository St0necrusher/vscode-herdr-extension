from: claude-main (Claude Code, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/recreate-1.md
skills: implement-slice, tests

# Slice `recreate`: place Pane Editors by recreating instead of moving (fixes the 12 → 13 → 12 bug)

You are worker `sol-identity` (pi, Herdr pane w3:p6G). Rules: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/briefs/common.md (validation, report format, asking the architect `astra-arch`).

Read:
- /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/architecture.md, section **"Recreate instead of move"** (authoritative; the owner decided it) plus "Public seams"/"Decisions" for what stays (whole grid, sizes, focus beyond eight, waits, failure, lifecycle rules).
- /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/bug-tab-switch-1.md (the bug; the failing regression `returns to real Tab 12 after Tab 13 merges its already-open Pane Editors` and its sibling `switches from real Tab 13 to Tab 12…` are in `test/extension/tab-layout.test.ts`, uncommitted).
- Current code: `src/features/open-tab/OpenTabFeature.ts`, `src/modules/pane-editors/PaneTerminalSurfaceManager.ts` (`placePanes`, `focusPane`, `closePanes`, `handleSurfaceClosed`), `paneTerminalPlacement.ts`, `src/core/editor-groups/index.ts`.

## Build
- The manager closes Pane Editors through their bound Tab (`vscode.window.tabGroups.close`), awaiting closure through the existing surface-closed path. Decide the seam with the smallest public surface, e.g. `placePanes` takes the target count / does closing itself before layout is impossible since the feature applies the layout — so likely a separate `PaneTerminalPlacement` step (e.g. `closeDisplacedPanes(requests)` before the layout, `placePanes(requests)` after). Keep the feature as the owner of the sequence; the manager owns Pane Editor tabs.
- Remove: `moveActiveEditor` placement, fill-before-drain, the untitled placeholder, cycle handling, source-group activation before a move. Keep: creating missing Pane Editors directly in their cells, showing each cell's Pane Editor as active, final `focusPane` with `focusEditorGroup`.
- No guards for unrealistic cases, no flags, no sleeps; bounded event waits only.

## Tests (`test/extension/tab-layout.test.ts`, fixtures file if needed)
- Both 12/13 tests pass: final cells, focus; Tab 12 Pane Editors that were in surplus groups are recreated (new Terminals), Tab 13 Pane Editors in groups 1..n stay behind (same Terminals).
- Update scenarios that asserted a *moved* Pane Editor keeps its Terminal (lone misplaced editor; two-Pane swap; two disjoint swaps; move out of inactive group nine): they now assert the misplaced Pane Editor is closed (its old Terminal closed) and a new one sits in its cell; literal final tabs; no placeholder concept left. Keep the rest (shape, merge of files with dirty document, fewer groups, 2:1, repeat click recreates nothing: same Terminals, focus beyond eight).
- Keep the harness's max-one-live-client-per-Pane assertion; adjust the "no Terminal closed" assertion to: only the expected displaced Pane Editors close.
- Name tests by behaviour; literal expectations (the `tests` skill).

## Done when
All of the above, full validation per common.md (both extension runs), no old move code left. Report: summary ≤ 20 lines (status, checks, test list with what changed, deviations, questions), last line exactly `<!-- end of reply -->`, then a one-line final message.
