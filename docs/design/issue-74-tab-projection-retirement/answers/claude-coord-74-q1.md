# Tests-plan consultation — #74

## Summary

**Explanation of the accepted design:** the proposed seam and two-slice cut are sound.
Add the already-required “former member shares the target's group” case.
Strengthen I7 with independent Tab/Pane retirement cases and their different membership behavior after re-entry.
Keep failure notification and synthetic close-veto tests excluded for now; I7 provides a realistic way to exercise the membership asymmetry.
Keep one observable Pane-command adapter assertion; a compiling fixture alone is not adapter coverage.
Deleting the obsolete return-to-Tab test is reasonable if no unique still-valid assertion is lost.
Unused navigation doubles may fail explicitly, but adapter error handling can swallow their rejection; do not treat them as a reliable tripwire alone.
No product amendment or test-writing authorization is introduced by this answer. The coordinator obtains approval of the bounded scenario set and optional selections.

## Q1. Priorities and missing scenarios

### Critical now

Retain proposed scenarios 1 and 3–8, with these refinements:

- **Shared-group clicked member:** include a former member sharing the clicked member's group, close it through navigation, and assert the clicked member's identity/outcome based on the group **after** the close. This was explicitly included in architecture verification item 3; hidden-but-bound coverage does not substitute for it. Seam: public manager navigation, real extension host. Risk: reading tab counts too early. Existing S1–S4 arrangements alone do not exercise two members in the same group.
- **I7 regression:** exercise the two triggers independently from a fresh projection with a member in the Panel: unrelated Tab navigation succeeds and leaves that terminal open; unrelated Pane navigation succeeds and leaves it open. Do not test only Tab→Pane in one chain, because that can conceal a defect in the second trigger's initial membership state. Seam: real host Panel move plus public Tab/navigation entry points. This is the concrete regression discovered in final review, so critical, not an incidental platform variation.
- **I7 membership after return to the grid:** pair the above with the accepted asymmetry: after Tab retirement, returning the terminal to the editor grid makes it eligible for a later unrelated navigation to close; after Pane retirement, returning it leaves it ordinary and subsequent navigation does not close it. Observe terminal identity/open state, not the private set. Use the existing host move/rebinding capability without new production hooks. This protects architecture answer 10 and the retained-versus-cleared membership rule through a reachable state rather than an artificial close failure. If a deterministic host return-to-editor operation cannot be established, report that bounded verification gap instead of asserting through private state or waiting arbitrary sleeps.
- **D6:** strengthen “plain openPane closes nothing” by following it with navigation: original projected members should still retire, but the plainly opened non-member survives. Otherwise a bug that silently clears membership during ordinary opening passes the first assertion. This stays within the same public-manager scenario; no need to run every creation feature end to end.

Keep S2–S4 identity assertions even though gate 4 ran manually: those now protect our ongoing behavior. “Excluded empty-group removal” means no independent VS Code conformance test, not excluding the resulting group assertions our behavior depends on.

**I3/answer 7 failure injection:** deliberately exclude new close-refusal/timeout tests for this phase unless a realistic, controllable failure is already available at a supported boundary. Do not introduce a production seam, mock global VS Code internals, or intentionally break a collaborator contract merely to force it. The accepted failure semantics still matter; the realistic I7 re-entry cases above cover the significant set-clearing/retention distinction without pretending to test close failure. Error-message UI remains excluded. State this limitation in the report.

### Optional

Agree with including Agent-click integration and dragged-member retirement if the owner selects them. Agent navigation observes an actual adapter using the real manager; drag coverage protects object-based membership across binding changes. Keep manual-close/reopen and cross-Session harness expansion optional/deferred, not silently “proved.” The window-wide set reduces one risk but does not itself prove Session-qualified target matching; the rationale for deferral is bounded scope/existing identity handling, not impossibility of regression.

### Deliberately excluded

Retain Reload Window persistence, error-notification UI, private helpers, unsupported overlapping clicks, and orphan healing. Do not add the accepted timeout on clicking the Panel member itself as a slow critical test of a known limitation; document it.

## Q2. Public seam

**Explanation:** `manager.navigateToPane` is the right stable public seam for the behavioral matrix. The real manager/terminal/VS Code combination makes these extension-host integration tests, not tests of private implementation. Drive Tab opening through its existing command as proposed.

For adapter coverage, retain the existing `pane-command` test's observable check that the row command actually invokes navigation with the intended request (and awaits it where the current assertion requires). Updating only a constructor type or providing a callable stub proves nothing about routing. Reuse the existing assertion with the new method; no duplicate full projection matrix through `VsCodePanesView` is needed. Optional Agent coverage tests a different adapter, so it cannot substitute for Pane-command routing.

## Q3. Delete the obsolete return-to-Tab test?

**Explanation:** agree in principle. Its old preservation/recreation premise is intentionally invalid after D5. Scenario 1 plus repeat-click membership coverage supplies the relevant new behavior; keeping the old narrative would mislead.

This is not an independent audit of that test's body. Before deletion, the test worker should check whether it also contains a unique still-valid file-preservation, focus, or identity assertion; retain that assertion in the replacement scenario if necessary. Do not preserve assertions solely because they happened to be in the obsolete test.

## Q4. Unused navigation doubles

**Explanation:** a separate correctly typed `PaneEditorNavigation` double is appropriate for suites that never navigate. It may reject with a descriptive “unexpected navigation in this fixture” error; do not implement a production compatibility fallback or conflate it with `PaneTerminalOpening`.

Caveat: the production adapters intentionally catch navigation errors and show a message. A rejected unused double may therefore not fail the test that unexpectedly invokes it. Use the suites' existing unexpected-call/error observation mechanism where available; otherwise describe it as a nonfunctional unused stub, not a fail-fast guarantee. Do not build a new mocking framework for this. The manager-backed agents fixture should supply the manager through both distinct dependencies as needed.

## Q5. Slice cut

**Explanation:** agree: fixtures first, then projection behavior plus the selected Agent/drag cases. Keep the slices sequential because both touch `agents-navigation.test.ts`. The first slice repairs dependency types/doubles and adapts existing routing assertions, without new behavior scenarios; validate restored typecheck/lint before attributing later runtime failures to the second slice.

The second slice owns `tab-layout.test.ts` and, if Agent integration is selected, `agents-navigation.test.ts`. Include the refinements above in its approved bounded brief. Normal validation gates remain required; the earlier permission to use direct esbuild was supplemental evidence, not permanent exemption from standard commands.

## Evidence and authority

This consultation uses the coordinator's supplied harness/test inventory and the current approved architecture, particularly answers 7 and 10 and verification item 3. It does not claim a fresh source audit or runtime test execution. No implementation change is proposed. Record scenario refinements with the testing plan and obtain the user's approval/optional selections under `testing-scenarios` before authoring.

<!-- end of reply -->
