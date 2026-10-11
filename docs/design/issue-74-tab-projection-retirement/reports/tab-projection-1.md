# Tab Projection test slice — report

- **Status:** scenarios implemented; validation is blocked by two unresolved Tab-layout behavior failures.
- **Files changed:** `test/extension/tab-layout.test.ts`, `test/extension/agents-navigation.test.ts`; no production files changed.
- **D5/D7:** replaced the old Tab-switch expectation with projection retirement on Tab and Pane navigation clicks.
- **D8:** added clicked-member identity cases S1–S4, hidden-but-bound reveal, and shared-group identity.
- **D1/S8/D6:** added Pane Editor survival, repeated Tab click, and plain Pane open followed by navigation.
- **I7:** added independent Tab/Pane Panel triggers and post-return membership checks (8a–8d).
- **Optional cases:** Agent-click retirement and dragged projected Pane Editor (D2) added.
- `npm run typecheck`: passed; `npm run lint`: passed; `npm run format:check`: passed.
- `npm test`: 16 files passed, 158 tests passed.
- `npm run test:extension`: host suite 98 passed / 2 failed; real composition 1/1 passed.
- Fresh-window baseline: 0/1; `takes keyboard focus from the Panes View` timed out (the documented baseline exception).
- Focused Tab-layout rerun: 32 passed / 2 failed, reproducing the same two failures.
- **Failures:** dragged-member closure invariant; shared-group case expected one `p6E` tab but observed zero.
- **Gaps/deviations:** no approved scenario omitted; obsolete reverse-switch test removed; failing cases placed last to limit cascading failures.
- **Questions/new domain decisions:** none; these tests encode approved behavior and introduce no new domain terms or hard-to-reverse decisions.

## Details

### Files and scenarios

`test/extension/tab-layout.test.ts` adds a `navigateToPane` harness path using the real manager and shared navigation postconditions, plus Panel-terminal exclusions that preserve open/closed checks. Scenario coverage:

| Approved behavior | Test(s) |
| --- | --- |
| D5: replacing a projected Tab retires its prior members | `a Tab navigation click retires the previous Tab Projection` |
| D5/D7: a Pane navigation click retires projected members before opening another Pane | `a Pane navigation click retires the Tab Projection before opening another Pane` |
| D8 S1–S4: clicked Pane Editor identity follows its group at click time | `clicking a projected Pane Editor with a file in its group keeps its identity`; `clicking a lone projected Pane Editor recreates it in the remaining file group`; `clicking a projected Pane Editor in the only group keeps its identity`; `clicking a projected Pane Editor beside a file recreates it in that file group` |
| D8: hidden-but-bound target is revealed, not recreated | `clicking a hidden but bound Pane Editor reveals it instead of recreating it` |
| D8 architect refinement: clicked member survives after another shared-group member closes | `clicking a projected Pane Editor that shared a group keeps its identity after the other closes` — fails as detailed below |
| D1: Pane Editor already in place survives later navigation | `a Pane Editor already in place survives a later Pane navigation click` |
| S8: repeated Tab click preserves projection until navigation | `a repeated Tab click keeps its Tab Projection until a Pane navigation click` |
| D6: ordinary Pane opening does not retire; following navigation does | `plain Pane opening leaves the Tab Projection for the following navigation click` |
| I7: Panel member survives Tab/Pane triggers; return-to-grid membership is checked | `Tab navigation leaves a Panel Pane Editor open and retires it after it returns to the grid`; `Pane navigation leaves a Panel Pane Editor open and relinquishes it after it returns to the grid` |
| Optional D2: dragged projected member closes on navigation | `a dragged Tab Projection Pane Editor still closes on navigation` — fails as detailed below |
| Optional Agent click | `an Agent navigation click retires the Tab Projection before opening its Pane` in `test/extension/agents-navigation.test.ts` |

The two obsolete tests that asserted reverse Tab projection retention/recreation were removed or replaced. Their generic in-place identity and recreation assertions remain covered by the existing placement/repeat tests and the new D8 cases; no unique valid assertion was carried over. I7 return-to-editor operations were deterministic in the host run, so 8c/8d are included rather than reported as a gap.

### Validation and failures

The required sequence was run from the repository root:

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed; Prettier reported all files formatted.
- `npm test` — 16/16 files, 158/158 tests passed.
- `npm run test:extension` — Tab-layout and other extension host tests: 98 passed, 2 failed. Both failures reproduce in the focused Tab-layout run (32 passed, 2 failed). The real Herdr extension composition suite passed 1/1.
- The separate fresh-window run failed 0/1 at `The first Pane Editor of a window` → `takes keyboard focus from the Panes View`, timing out while waiting for keyboard focus; this is the baseline exception explicitly documented in the slice brief.

The two unresolved extension failures are:

1. `a dragged Tab Projection Pane Editor still closes on navigation` — assertion `only expected displaced Pane Editor p6E closes` failed (`false !== true`): the declared displaced `p6E` Terminal had not closed at the postcondition.
2. `clicking a projected Pane Editor that shared a group keeps its identity after the other closes` — assertion `Pane p6E appears once` failed (`0 !== 1`): the postcondition observed no `p6E` editor tab.

These contradict the approved expected behavior. No production code or assertions were changed to work around them; they remain blockers for claiming the scenarios validated. The final test order puts the two known failure cases last because earlier experiments showed failures could cascade into later host scenarios.

The D6 group literal was not specified verbatim in the brief; the host observation was `[["file.txt", "p69", "p6C"]]`, and that literal is asserted against the approved remaining-group arrangement. No new terms or hard-to-reverse design decisions were introduced; no `CONTEXT.md` or ADR update is proposed.

<!-- end of reply -->
