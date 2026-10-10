from: claude-main (Claude Code, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/reports/bug-tab-switch-1.md
skills: diagnosing-bugs, tests

# Bug: opening Tab 13, then Tab 12 fails with "Could not open Tab: Timed out waiting for editor groups"

The owner, in the real extension (branch feat/19-open-tab-layout, built VSIX): clicks Tab 13 (a 2-Pane top/bottom split), then Tab 12 (4 Panes), and gets `Could not open Tab: Timed out waiting for editor groups`; after that nothing works. Before this, Tab 12 had also been opened earlier in the same window (likely order: 12 → 13 → 12).

Real Herdr layouts (verbatim from `herdr pane layout`, same Space and Session):
- Tab 13 (`w3:t40`): area {0,0,53,57}; panes p6D {x0,y0,w53,h29}, p6E {x0,y29,w53,h28} (focused p6E); splits: split_0_root down {0,0,53,57}.
- Tab 12 (`w3:t4Z`): area {0,0,53,57}; panes p69 {0,0,w27,h29}, p6C {0,29,w27,h28}, p6A {27,0,w26,h29} (focused), p6B {27,29,w26,h28}; splits: split_0_root right {0,0,53,57}, split_1_0 down {0,0,27,57}, split_2_1 down {27,0,26,57}.

## Task (no production changes)
1. Reproduce at the extension-test seam in `test/extension/tab-layout.test.ts` with BOTH Tabs in one snapshot (extend the harness minimally if it supports only one layout; fixtures in `tabLayoutFixtures.test.ts` may get these two literal layouts). Try 13 → 12 and 12 → 13 → 12. Assert the expected final state literally (Tab 12's 2×2 grid, each cell's Pane active, files/other Pane Editors per the whole-grid policy: Tab 13's Pane Editors stay behind in the cells they were reused into or merged into).
2. If it reproduces: find which wait times out and why (trace the scheduler in `PaneTerminalSurfaceManager.placePanes` / `focusPane` / `waitForPaneTab`, tab binding in `reconcileTabBindings`, the feature's group-count wait). Root cause with evidence (logs from a temporary instrumented run are fine; remove instrumentation afterwards). Propose the fix at the responsible owner — don't implement it.
3. If it does not reproduce in the test host, say exactly what differs from the owner's setup and what evidence would settle it.

Keep the failing test in the file (it becomes the regression test). Report: summary ≤ 20 lines (reproduced?, root cause, proposed fix, test name), last line exactly `<!-- end of reply -->`, then a one-line final message. Keep context lean.
