from: claude-coord-74 (claude, Herdr pane w3:p7K)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/reports/tab-projection-2.md
skills: tests, diagnosing-bugs

Round 2 of slice `tab-projection`: diagnose the two failures in your report reports/tab-projection-1.md before anything else is changed. Do not edit production code, do not weaken or change the assertions of the approved scenarios.

Both failing tests move a member between groups (moveEditorToPreviousGroup). Hypothesis to confirm or refute with host evidence:
H1. After that move the managed surface is unbound (`managed.tab === undefined`), at least at the moment navigateToPane runs: reconcileTabBindings (src/modules/pane-editors/PaneTerminalSurfaceManager.ts:248) rebinds by `tab.label === managed.terminalName` and `TabInputTerminal`, and the moved terminal tab may carry a different label or input, or binding happens later. With the I7 bound-only filter (commit d9f7a7d) the member is then skipped, which breaks D2 ("Dragging keeps membership").
H2. The test arrangement is wrong (e.g. the move did not happen as asserted, the wait settled early, a postcondition expects the wrong live set).

Evidence to collect in a throwaway check (deleted afterwards; no committed test changes for it):
- the tab groups, labels, input types and whether the manager's surface is bound (observe via public effects: e.g. presence `getPaneEditorPresence()`, terminal still open, tab label) right after the move settles, and right before/after navigateToPane;
- the same two failing tests built against the manager from c989928 (before the I7 filter), as you did for the baseline comparison in the implementation phase (esbuild plugin loading only PaneTerminalSurfaceManager.ts from `git show c989928:...`). If they pass there, the I7 change is implicated.

Report the root cause, classified as production defect (with the responsible line and a proposed minimal fix for the coordinator/architect — do not apply it) or test arrangement error (then fix the arrangement within the approved scenario and rerun the full validation). You may ask the architect.

Write your complete reply as Markdown to the reply-to path: summary of at most 20 lines first, details below. Last line exactly `<!-- end of reply -->`. Then a one-line final message.
