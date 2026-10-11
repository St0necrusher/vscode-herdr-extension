from: claude-coord-74 (claude, Herdr pane w3:p7K)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/answers/claude-coord-74-q1.md
skills: architect

Tests phase for #74 (owner reviewed the implementation; commits c989928, d9f7a7d on feat/74-retire-tab-projection; I7 recorded in architecture.md answer 10 and ADR 0018). Answer the questions below and add each decision to progress.md. Use read-only research subagents for code evidence if needed.

## Proposed scenario list (testing-scenarios, after implementation)

Seam: the extension-test harness in test/extension/tab-layout.test.ts (real PaneTerminalSurfaceManager + VsCodePaneTerminalSurface, OpenTabFeature via the prefixed herdr.openTab command), extended with navigateToPane(paneId) calling the public PaneEditorNavigation.navigateToPane on the real manager. Observations: tabs per editor group, terminal identity (strictEqual/notStrictEqual), active tab, open/closed terminals.

Critical:
1. D5: Tab 13 -> Tab 12 with a file open: Tab 13 members close, file stays, [p69][p6C][p6A][p6B]. Replaces "switches from real Tab 13 to Tab 12 while retaining…".
2. Delete "returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13": its premise (old Tab's Pane Editors stay behind) no longer exists; scenario 1 covers Tab switching.
3. D7: Tab click, then navigateToPane on another Tab's Pane: all members close, the Pane opens next to the file.
4. D8 S1–S4 with terminal identity (S1/S3 kept, S2/S4 recreated), plus a clicked member that is bound but not the active tab of its group.
5. D1: a Pane Editor already in place before the Tab click is not a member; survives the next navigateToPane.
6. S8: repeat Tab click, then navigateToPane: the original members still close.
7. D6: plain openPane (Create/Split path) after a Tab click closes nothing.
8. I7: a member moved into the Panel (workbench.action.terminal.moveToTerminalPanel) — the next Tab click lays out and the Panel terminal stays open; a navigateToPane to another Pane opens it.
9. Fixture migration, no new assertions: createNavigation in agents-navigation / creation-commands / management-commands / run-npm-script gains a separate paneEditorNavigation dependency (manager in agents-navigation; doubles elsewhere), pane-command double gets navigateToPane. Restores typecheck/lint.

Optional, I recommend including: (a) Agent click retires (agents-navigation already uses the real manager; covers the RevealPaneFeature adapter wiring); (b) D2: a dragged member still closes on the next navigation (guards identity-based membership).
Optional, I recommend excluding: hand-closed member reopened by Split is not closed (handleSurfaceClosed path, low risk); I1 cross-Session retirement (needs a two-Session harness; window-wide set has no Session keying to regress).
Excluded: VS Code empty-group removal (gate 4), error notification path, Reload Window (D3), private helpers.

## Questions

Q1. Is anything critical missing or mis-prioritised against the design's risks (readiness answers 1–10)? In particular: should I3 (clear-first on Pane path) or answer 7 (Tab path removes members only by successful close) get a test, or stay excluded as failure paths?
Q2. Seam: is calling manager.navigateToPane directly acceptable as the stable public seam for 3–8, versus driving the herdr.openPane command through VsCodePanesView? Proposal: manager seam for behaviour; the adapter is covered by pane-command (fixture) and optional (a).
Q3. Deleting test 2 rather than rewriting it: agree?
Q4. Fixture doubles in creation-commands / management-commands / run-npm-script: those suites never click Pane rows; proposal: a navigation double that rejects ("not used"), like their other unused dependencies. Agree?
Q5. Cut: slice "fixtures" (scenario 9) first, then slice "tab-projection" (1–8 + a, b) — (a) lives in agents-navigation.test.ts, so it goes into the second slice as a second owned file. Any objection?

Write your complete reply as Markdown to the reply-to path: a summary of at most 20 lines first, details below. Its last line must be exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
