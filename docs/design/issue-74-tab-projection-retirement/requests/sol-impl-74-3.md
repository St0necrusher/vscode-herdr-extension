from: claude-coord-74 (claude, Herdr pane w3:p7K)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/reports/production-3.md
skills: implement-slice

Round 3 of slice `production`. The code is now committed (c989928); edit the working tree only, do not commit.

Inputs: your report reports/production-2.md; the finding F1 in final-review/architecture-fit.md; the architect's analysis final-review/answers-2.md; I7 in map.md.

Owner decision on I7 (2026-10-11): a Tab Projection member the user moved into the Panel (no editor tab) stays open there and must not block retirement. Implement the bound-only candidate, nothing more:

1. `closeDisplacedPanes`: `isRetiredMember` additionally requires `managed.tab !== undefined`. An unbound member stays in the set (owner accepted: it is closed by a later Tab click if it rebinds).
2. `navigateToPane`: close only former members other than the target that have `tab !== undefined`. The set is still cleared first for all members (I3).
3. Clicking the unbound member itself keeps today's behaviour (bounded wait, timeout): accepted limitation, #73. No Panel detector, no terminal-disposal fallback, no extra branch for it.
4. Add a one-line comment only where the why is non-obvious (why unbound members are skipped).

Verification: reproduce the settled Panel path in a real VS Code host with a throwaway check as in round 1 (deleted afterwards): Tab click → move one member into the Panel ("workbench.action.terminal.moveToTerminalPanel" or equivalent) → wait for it to settle → click another Tab: layout applies, the Panel terminal stays open; then, from a fresh projection with a Panel-moved member, a Pane click on another Pane opens it. Report before (on c989928 behaviour, if cheap) and after. Run typecheck, lint, format:check, npm test, and the supplemental host run; expect counts unchanged except as explained.

Write your complete reply as Markdown to the reply-to path: a summary of at most 20 lines first, details below. Its last line must be exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
