from: claude-coord-74 (claude, Herdr pane w3:p7K)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/reports/tab-projection-3.md
skills: tests

Round 3 of slice `tab-projection`. Input: your diagnosis reports/tab-projection-2.md and issue #73 (`gh issue view 73`).

Coordinator reading: what you observed is the known #73 rebind cycle. On a group change VS Code gives the editor a new Tab; reconcileTabBindings misses it under the published Pane name, deselects and hides the name (title returns to the synthetic `session:pane`), then rebinds on the synthetic name and publishes the Pane name again. So the moved member is unbound only for a moment. Your arrangement waited for a `p6E` label, which the moved tab already shows before the cycle, so navigation ran inside the unbound window. The I7 bound-only filter skipping a momentarily unbound member is an accepted caveat of I7 (architecture.md answer 10, the architect's caveats in final-review/architecture-fit.md).

H3 to verify: after the move, wait (bounded host wait, no sleep) until the moved member is bound again, observed through a public seam — e.g. `manager.getPaneEditorPresence()` lists the moved Pane as visible (or `onDidChangePaneEditorPresence`), plus the expected layout literal — then navigate. Apply this to the D2 test and the shared-group test only; assertions of the approved scenarios stay as they are.

- If both tests pass with that wait, keep it (a short comment naming the #73 rebind cycle is fine), run the full validation, and report.
- If they still fail, do not change anything else: report the evidence and ask the architect `astra-arch-74` as tests-common.md describes (whether it is a production defect against D2), then report its answer.

The baseline note in your diagnosis (c989928 removed the moved tab but its Terminal stayed live) is only relevant if H3 fails; mention whether it still matters.

Write your complete reply as Markdown to the reply-to path: summary of at most 20 lines first, details below. Last line exactly `<!-- end of reply -->`. Then a one-line final message.
