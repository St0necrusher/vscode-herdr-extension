from: sol-fix-74 (pi, Herdr pane w3:p7Q)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/answers/sol-fix-74-q1.md
skills: architect

## Question: settled moved member closes correctly, but host retains its Terminal

Bounded diagnosis requested by `requests/sol-fix-74-1.md`; owned manager/surface only, tests unchanged. Need your ruling before altering close ordering or treating a host defect as a test-oracle conflict. Please answer directly; do not delegate or edit source.

Real-host trace of the unchanged isolated dragged test on VS Code 1.141.0:
`node esbuild.mjs && npx vscode-test --config .vscode-test.mjs --label extension --run dist/test/extension/tab-layout.test.js --grep 'a dragged Tab Projection Pane Editor still closes on navigation'`
0 passed / 1 failed, `only expected displaced Pane Editor p6E closes` false !== true.
Trace in `.pi/tasks/01a12a8d-2b97-724a-b478-7a32ba5c268a-44445/bfb264215.output` (grep DEBUG-74move; temporary diagnostics in owned files will be removed).

- p6E retains membership through target-tab replacement/unbind/synthetic-name rebind.
- At navigation both p6D and p6E are members with current bound Tabs present by object identity in the grid; both original Terminals are live.
- The close helper selects both current tabs, not stale tabs. `tabGroups.close` returns true.
- Both Pseudoterminal.close callbacks fire; manager.handleSurfaceClosed deregisters both and invokes surface.dispose; surface calls terminal.dispose.
- When close resolves, p6D is absent from window.terminals, p6E is still present. Both tabs are gone, both surfaces deregistered. Navigation opens p69 correctly. p6E never fires onDidCloseTerminal (the test observes it).

Source evidence: manager `closePaneEditors` (~126), `handleSurfaceClosed` (~237); surface `pty.close` (~155) and `dispose` (~217). Existing `test/extension/pane-editors.test.ts:240-263` C10 explicitly documents and tolerates this exact VS Code host behavior: 'VS Code closes a moved terminal with its tab but skips onDidCloseTerminal; only the Pseudoterminal hears it' and 'Without onDidCloseTerminal, VS Code keeps listing the closed terminal.'

This refutes membership-loss and stale-binding explanations **after settling**. It also explains c989928's removed-tab/live-Terminal clue. No equal-title rebinding or #73 identity fix appears necessary.

Proposed next bounded experiment: initiate disposal through the known owned `surface.terminal.dispose()` before the tab-close host path destroys its registration, and preserve bounded close completion/current-tab failure semantics if the host supports them. This uses stable owned Terminal identity, not display-name matching or move pairing. Is this local owner-lifecycle correction within the accepted design? If terminal-first must replace `tabGroups.close` entirely (so refusal semantics differ), is that permitted as an explanation, or an amendment requiring approval? Please distinguish experiment authorization from production acceptance.

If host disposal-first cannot generate onDidCloseTerminal, my recommendation is report a demonstrated host-lifecycle limitation/test-oracle contradiction (existing C10 precedent), not silently solve #73 or spoof the event. Please confirm the escalation path; tests remain read-only and unchanged.

Write complete Markdown reply to reply-to, summary <=20 lines first, details below; last line exactly `<!-- end of reply -->`. Then a one-line final message.
