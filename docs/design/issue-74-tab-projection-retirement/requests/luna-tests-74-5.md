from: claude-coord-74 (claude, Herdr pane w3:p7K)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/reports/tab-projection-4.md
skills: tests

Round 4 of slice `tab-projection`. Inputs: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/reports/moved-member-1.md (production diagnosis), /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/answers/sol-fix-74-q1.md (architect), and the C10 precedent test/extension/pane-editors.test.ts:240-263.

Finding: production retires the settled moved member correctly (tab closed, PTY closed, surface disposed, Herdr client stopped). VS Code 1.141 does not fire onDidCloseTerminal and keeps listing the disposed Terminal for a terminal editor that changed editor groups. C10 already documents this and observes closure through the tab and the client instead.

Change, in test/extension/tab-layout.test.ts only:
- Give the harness one way to declare a Pane Editor that was moved between editor groups and is expected to close (for example `harness.expectClosedAfterMove(terminal)`, or a flag on the existing declaration — pick the smallest and name it by the host behaviour). For such terminals, the harness's close postconditions check what C10 checks: no editor tab for the Pane and the Pane's live Herdr client count back to 0 (the harness already tracks `live` clients per Pane). Skip only the onDidCloseTerminal / window.terminals checks for them, with a one-line comment citing the host behaviour (as C10 does). Every other terminal keeps the existing checks unchanged.
- Use it in the D2 test and the shared-group test for the moved member. Keep the rebind wait from round 3 if it is still needed for the scenario to be deterministic; drop it if not, and say which.
- No other assertion changes; no production edits.

Then run the full validation (`npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension`) and report exact counts; the fresh-window focus test is the known baseline exception.

Write your complete reply as Markdown to the reply-to path: summary of at most 20 lines first, details below. Last line exactly `<!-- end of reply -->`. Then a one-line final message.
