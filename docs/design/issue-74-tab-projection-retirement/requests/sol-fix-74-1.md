from: claude-coord-74 (claude, Herdr pane w3:p7K)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/reports/moved-member-1.md
skills: implement-slice, diagnosing-bugs

You are `sol-fix-74`, production worker for slice `moved-member` of issue #74 in /Users/kuzmichev/dev/vscode-herdr-extension (branch feat/74-retire-tab-projection, main checkout; do not switch branches, do not commit).

Rules: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/briefs/common.md (implementation-phase common brief; your worker name is sol-fix-74, architect astra-arch-74 at w3:p7H). Design: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/architecture.md (answers 1–10, esp. 2, 3, 7, 10), map.md D2 ("Dragging keeps membership"), ADR 0018, issue #73 (`gh issue view 73`, the rebind cycle on group change).

Problem: a Tab Projection member moved to another editor group (`workbench.action.moveEditorToPreviousGroup`), after its binding has settled (manager presence lists it visible, same vscode.Terminal), is NOT closed by the next `navigateToPane` to another Pane. Its Terminal never fires onDidCloseTerminal. Evidence and failing tests: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/reports/tab-projection-1.md, -2.md, -3.md; architect ruling /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/answers/luna-tests-74-q1.md. The uncommitted test file test/extension/tab-layout.test.ts holds the two failing tests ("a dragged Tab Projection Pane Editor still closes on navigation", "clicking a projected Pane Editor that shared a group keeps its identity after the other closes") — read-only for you; run them with
`node esbuild.mjs && npx vscode-test --config .vscode-test.mjs --label extension --run dist/test/extension/tab-layout.test.js --grep '<name>'`.

Task:
1. Diagnose the move → rebind → retirement → close sequence in a real host (throwaway instrumentation, removed afterwards): is the member still in the set at navigation, is it selected for closing, what Tab object is closed (stale vs current), does tabGroups.close return true, does the surface deregister, does the Terminal dispose? Also explain the earlier baseline clue (c989928: moved tab removed, Terminal stayed live).
2. Fix the cause at its owner (PaneTerminalSurfaceManager or, if the evidence shows it, the surface binding) with the smallest change, within the approved design. No sleeps, no retries standing in for ordering, no test-only hooks, no Panel detector. If the fix needs a design choice (e.g. how a moved editor is re-identified — #73 lists the constraints), ask the architect first, and stop with a report if it amounts to solving #73.
Owned files: src/modules/pane-editors/PaneTerminalSurfaceManager.ts; src/modules/pane-editors/PaneTerminalSurface.ts only if the diagnosis shows the cause there (say why).

Done when the two tests pass unchanged and the full validation passes (`npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension`; fresh-window "takes keyboard focus from the Panes View" is the known baseline exception). Report exact counts.

Write your complete reply as Markdown to the reply-to path: a summary of at most 20 lines first (root cause with file:line, fix, checks, questions), details below. Its last line must be exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
