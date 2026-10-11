from: luna-tests-74 (pi, Herdr pane w3:p7P)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/answers/luna-tests-74-q1.md
skills: architect

Please decide whether the remaining D2/shared-group failures after waiting for the #73 rebind cycle are a production defect against the accepted #74 behavior, or whether the test's arrangement/expectation should change. Do not authorize a test assertion change unless the accepted behavior itself changes.

Evidence:

- The approved behavior says Tab Projection membership follows a dragged Pane Editor: `docs/adr/0018-navigation-click-retires-the-tab-projection.md:5-13` says a Pane Editor created by the Tab click “stays in [the Tab Projection] if the user drags it elsewhere afterwards,” and the next navigation click retires that projection. `docs/design/issue-74-tab-projection-retirement/architecture.md:24` likewise says the set follows drags; the test plan lists “a dragged member still closes” as D2 at line 101.
- Issue #73 (`gh issue view 73`; https://github.com/St0necrusher/vscode-herdr-extension/issues/73) documents that VS Code replaces a `vscode.Tab` during an editor-group move and temporarily unbinds the Pane Editor; the same `vscode.Terminal`/surface survives, the Pane name and Visible mark flicker, then the manager rebinds.
- The I7 architecture-fit caveat (`docs/design/issue-74-tab-projection-retirement/final-review/architecture-fit.md:56-59`) says `tab === undefined` is not a reliable Panel detector because manual moves briefly unbind. In response, I added a bounded #73 wait to only the D2 and shared-group tests: `test/extension/tab-layout.test.ts:461,482,508-521` waits for both the exact expected group literal and `getPaneEditorPresence().visible` to include moved `p6E` before navigation. The approved assertions are unchanged.
- The focused run of both tests still failed: D2 failed `only expected displaced Pane Editor p6E closes` (`false !== true`); the following shared-group case timed out. Each case was then run alone in a fresh host after the same wait. Both waits resolved and both tests failed the same `only expected displaced Pane Editor p6E closes` invariant (`false !== true`). Thus the initial result is not solely the transient pre-rebind interval or cross-test order.
- The D2 command used the real manager and `moveEditorToPreviousGroup`; the test asserts the exact post-move layout `[file.txt, p6D, p6E]` (or `[p6D, p6E]` for the shared-group case), and proceeds to `navigateToPane` only after public presence confirms `p6E` is visible.

Question: after the public rebind signal and expected editor-group layout have settled, should a subsequent navigation click close the displaced `p6E` Pane Editor in D2 and the shared-group case? If yes, please confirm these remain production defects under D2/I7 and identify the responsible behavior to hand back to the coordinator. If no, please identify which approved D2/ADR 0018 expectation is superseded and what should replace it.

Proposed answer: yes; once the move/rebind cycle settles, a grid member must remain in the Tab Projection and close on navigation. The exception in I7 is a Pane Editor in the Panel, not one that moved to another editor group. Keep the wait and assertions as written; do not weaken them or change production code in this worker slice.
