# luna-tests-74-q1 — settled editor-group move

## Decision

**Explanation of accepted behavior: yes.** A projected member moved to another editor group must retain membership. Once its binding has settled, navigation must close it when it is a former member other than the clicked target. D2/ADR 0018 has not been superseded. I7 does not exempt a member with a bound editor tab.

Keep the approved behavioral assertions and the bounded public-state settling wait. Do not weaken the expected closure, replace the moved terminal with a freshly opened one to make the test pass, or modify production in this test slice. Return the failures to the coordinator as a **production-behavior defect against the accepted design**, pending diagnosis of the specific cause.

## Scope and evidence qualification

Your reported independent fresh-host runs, exact post-move group contents, and public visible-presence signal address the transient-unbound explanation. They make this a concrete failing supported scenario, not an imagined race or merely test-order contamination. This answer relies on your supplied run evidence; I have not independently run or audited the tests.

I7 is technically a bound-only retirement rule, not a reliable Panel detector: it intentionally skips an unbound former member at retirement. Once the member is bound in the grid, that skip is no longer the intended explanation. The accepted limitation for clicking an unbound target is also irrelevant to closing the other, settled member here.

The clicked target remains subject to S1–S4: retain or recreate it according to its group **after** other members close. This decision does not require indiscriminately closing every moved target.

## Responsible behavior / coordinator hand-back

The responsible owner is `PaneTerminalSurfaceManager`: preserve membership for the surviving managed Pane Editor across tab replacement/rebinding, and close bound former members through the shared retirement/close lifecycle. The surface/terminal binding and close path are part of that owner’s integration boundary.

The evidence establishes the wrong observable outcome; it does **not** yet identify whether membership was lost during move/close callbacks, retirement selected the wrong objects, or closure/tab reconciliation left the moved terminal alive. Do not prescribe a Set patch merely from the failed assertion. Investigate the move → rebind → retirement sequence, including exact surface/terminal identity and close completion, without adding permanent test-only production hooks.

Also verify during diagnosis that the assertion observes the correct current terminal identity after the move and that the successful public-presence check belongs to the same Session/Pane. This is a check of the test oracle, not authorization to change the expected behavior. If the host replaces an identity contrary to the assumed arrangement, report that evidence explicitly; do not hide it by weakening closure assertions.

A #73 mechanism may be the cause, but #73's deferral of flicker/orphan healing is not blanket permission to violate D2 after a settled editor-group move. The coordinator should open a bounded production diagnosis/fix or escalate a demonstrated architectural contradiction to the design owner. Any intentional narrowing of D2 requires owner/user approval and a recorded amendment; none is granted here.

## Required report

Include exact failing test names, fresh-host commands/results, post-move group/presence observations, the closure assertion, and the distinction between a bound grid member and an unbound Panel member. Keep the current test work and its write boundary; do not mark these tests as expected failures, skip them, or claim the validation gate passed.

No product amendment, new domain term, or ADR change is introduced. Decision recorded in `progress.md`.

<!-- end of reply -->
