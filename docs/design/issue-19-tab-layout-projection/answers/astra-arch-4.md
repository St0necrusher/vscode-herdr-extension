# astra-arch-4 — test scenario approval

## Summary

- **Approved: scenarios 1–11, with the assertion/brief corrections below.**
- This is the separate scenario and test-authoring approval, effective after the production slice's review acceptance is recorded.
- No new critical scenario is added. Scenarios may share tests; eleven scenarios do not require eleven tests.
- Approve explicit 2:1 and >8-Pane fixtures in the shared fixture file, preserving existing fixtures.
- Keep deeper mixed nesting optional and unselected; other stated exclusions remain.

## Scope and coverage

Use the real command/manager and observable editor-group seams as proposed. Existing pure-rule coverage cannot establish VS Code's placement, merge, focus or terminal-identity behavior; the obsolete extension assertion also does not cover these requirements.

- **1–4:** whole-grid shape, positional file preservation, surplus/dirty-editor preservation, and new trailing cells.
- **5–6, 11:** same-Terminal placement without group collapse, cycle completion and temporary-resource cleanup. Choose **two disjoint cycles plus an unaffected file-bearing group** for 11: it covers successive placeholder lifetimes beyond the single swap in 6.
- **7:** literal 2:1 weights with an explicit rounding tolerance and sufficient space to avoid minimum-size clamping.
- **8:** repeat the command and compare final placement/identity, not uninterrupted focus or client history.
- **9–10:** independently cover final focus beyond eight and moving from beyond eight. They may share a >8-Pane fixture/test, but both outcomes must be asserted.

All are extension-level behavioral tests. Keep the existing inexpensive fixture-shape table where meaningful; do not add a second deep-nesting suite or derive expected shapes using production tree/descriptor code.

## Required brief corrections

1. **Client uniqueness:** “no duplicate client at the end” is weaker than the approved invariant. Have the fake client boundary record maximum simultaneously live clients **per Pane throughout the operation** and assert at most one. This is an observable resource-safety invariant, not a start/stop-count assertion. Restarts and transient title changes remain allowed.
2. **Placeholder cleanup:** assert that no *new operation-owned* untitled tab remains, while pre-existing documents remain. “No untitled text tab anywhere” can incorrectly reject a legitimate dirty untitled document in scenario 3. Prefer exact expected final tabs or a before/after baseline.
3. **Regression evidence:** remove the requirement that every scenario fail against the old policy. Identity/repeat behavior may already have been correct. Mutating an expectation demonstrates that an assertion can fail, not that it detects the old implementation. Report the requirement protected and meaningful observed failures where available; no production mutation is required.
4. **Fixture ownership:** add `test/extension/tabLayoutFixtures.test.ts` to the execution plan's tests-slice allowlist, as already permitted by the brief. Retain existing literal fixtures and rerun their pure-rule consumers.
5. **Validation:** retain the two extension-suite runs and all static/unit checks. Replace “in the foreground” with execution through the worker harness's required runner, awaiting terminal results and inspecting logs. Report the exact known fresh-window failure separately; no obsolete-policy exemption remains.

Production defects discovered by tests return to the coordinator; do not change production or weaken expected behavior. This approval does not independently certify the production diff: the report describes implementation corrections, while production acceptance belongs to its review gate. No code changes or test runs were performed in this review.

<!-- end of reply -->
