# Tab-switch timeout diagnosis, round 1

## Summary

- **Reproduced:** `12 → 13 → 12` fails with the owner's exact `Could not open Tab: Timed out waiting for editor groups` error.
- `13 → 12` passes with literal final placement, active Panes, focus, and retained other-Tab terminals.
- Retained failing regression: **`returns to real Tab 12 after Tab 13 merges its already-open Pane Editors`** (`tab-layout.test.ts:221`).
- Root cause: the surplus merge invalidates hidden p6B's Tab binding; synthetic-name-only reconciliation never reacquires it.
- Exact timeout: initial `placePanes` bindings barrier → `waitForPaneTab(p6B)`; `managed.tab` remains undefined despite a live p6B tab in group two.
- Four groups already exist; no move, source-focus call, cycle, placeholder, or final-reveal phase has started.
- Proposed fix owner: `modules/pane-editors` identity/rebinding, not the feature or timeout helper. Replace the failed name-only identity handshake with verified reacquisition of hidden merged editors, retaining the same Terminal.
- Ordinary reveal and repeated synthetic-name publication were tested as diagnostic interventions and **did not fix it**; neither is a validated remedy.
- Production source unchanged. All temporary test/bundle instrumentation and interventions removed; the original failing sequence rerun.
- Typecheck, lint, format check: each exit 0. Unit suite: exit 0, 16 files / 158 tests passed.
- Full extension suite: exit 1; 86 main-suite passes / 1 reproduced regression failure; fresh-window 1 pass; composition 1 pass.
- `git diff --check`: exit 0. No new domain terms or implemented architectural decisions.

## Reproduction and retained tests

The owned fixture file now includes the supplied literal rectangles, split regions, Pane IDs, and focused Panes for both real layouts (`tabLayoutFixtures.test.ts:171`, `:189`). Both are also exercised by the existing shape table and pure-rule fixture consumer.

`withLayout` now accepts optional additional fixtures and an optional target Tab ID in `openTab`; both Tabs inhabit **one snapshot and one Session** for each switching test. Snapshot Tab/Panes/counts are assembled from the fixtures. Shared resource assertions apply to every opened Pane; active-cell assertions apply to the clicked Tab. The real command, feature, manager, surfaces, VS Code groups, and terminal APIs remain the seam. No private-method assertion or durable instrumentation was introduced.

1. **`switches from real Tab 13 to Tab 12 while retaining the other Tab's Pane Editors behind it`** (`tab-layout.test.ts:195`) passes. Expected final active grid is the literal 2×2 `[[p69,p6C],[p6A,p6B]]`; exact group tabs are `[["p6D", "p69"], ["p6E", "p6C"], ["p6A"], ["p6B"]]`. Both Tab 13 Terminals remain identical by reference. Column three and p6A end focused.
2. **`returns to real Tab 12 after Tab 13 merges its already-open Pane Editors`** (`:221`) fails on the **third click**, after successfully opening 12 and then 13. It retains the literal final 2×2 shape and exact tabs `[["p69", "p6D"], ["p6C", "p6E"], ["p6A"], ["p6B"]]`, all four original Tab 12 Terminal references, and column-three/p6A focus assertions. The command's timeout currently fails the no-errors assertion before these end-state assertions are reached. It is intentionally not skipped, marked expected-failure, weakened, or repaired.

One initial authoring run stopped before the third click because it incorrectly assumed a newly created p6E would append after every merged editor. VS Code inserted the new Pane Editor next to the active editor; the approved contract requires merged old editors' relative order, not an incidental insertion position for a newly opened Pane. That unnecessary intermediate assertion was removed. The literal required final assertions remain. Subsequent clean runs reproduce the user's timeout, independently of that authoring error.

### Tight feedback command

```bash
npm run build && npx vscode-test --config .vscode-test.mjs --label extension \
  --grep 'returns to real Tab 12'
```

The isolated trace run failed in about six seconds with 0 passing / 1 failing and the exact error. The two-sequence run (`--grep 'switches from real Tab 13|returns to real Tab 12'`) had 1 passing / 1 failing; the final full suite reproduces the same third-click failure without instrumentation. No real Herdr process is needed to reproduce it. The distinguishing load-bearing condition is reopening previously merged Pane Editors; the cold `13 → 12` control passes.

## Evidence and root cause

Initial ranked hypotheses were grid/focus collapse, stale merge bindings, and an active-tab/final-reveal wait. Public command/manager boundary tracing eliminated the first and third: `vscode.setEditorLayout` completed with four groups, placement began, and no `focusPane` or `moveActiveEditor` followed.

The deeper trace was added **only to the generated ignored test bundle**, not production TypeScript. `/tmp/sol-tests-5-binding-trace.log` establishes:

- **:301–312:** on `12 → 13`, p6A and p6B lose their former Tab objects as surplus groups merge into group two. `reconcileTabBindings` searches their synthetic identity names, but the new tabs initially still carry display names.
- **:327–328:** p6A's tab does acquire the synthetic name and rebinds. Thus this is not a wholesale failure of the snapshot, Session, or every moved Pane.
- **:311–431:** p6B's binding stays undefined; every synthetic-name lookup misses even though the p6B tab is still present. p6B is the hidden merged editor; p6A was the selected editor during the merge.
- **:432–441:** on the third click, four groups exist. Initial bindings succeed for p69, p6C, and p6A, then wait for p6B with `managed.tab === undefined`.
- **:445–448:** that wait times out; p6B is still behind p6E in group two, and groups three/four remain empty.

The decisive trace fragment is:

```text
waitForPaneTab start p69 ... p69
waitForPaneTab start p6C ... p6C
waitForPaneTab start p6A ... p6A
waitForPaneTab start p6B undefined undefined
waitForPaneTab probe p6B undefined undefined undefined false
place failed Error: Timed out waiting for editor groups
```

`/tmp/sol-tests-5-name-trace.log:440` additionally records `terminal-name p6B`, not the manager's expected `tab-layout-1:p6B`. `/tmp/sol-tests-5-rename-intervention.log:441–449` records the surface host as **open**, `paneNameVisible` as **false**, terminal name still **p6B**, and the binding still undefined even after explicitly republishing the synthetic identity name.

Relevant source owners:

- `PaneTerminalSurfaceManager.ts:86–95`: all requested existing bindings are awaited **before** scheduling any move or final reveal.
- `:176–181`: the waiter requires `managed.tab`; the presence of a visually correct editor alone cannot satisfy it.
- `:250–264`: a replaced Tab is discarded; the only reacquisition criterion is a terminal tab whose label equals `managed.terminalName`. Losing the old binding triggers `hidePaneName`.
- `PaneTerminalSurface.ts:197–199,252–256`: `hidePaneName` requests synthetic-name publication. In this observed hidden-merge case, that request does not produce the required name in the Terminal/Tab APIs.

**Confirmed application-level root cause:** hidden-merge identity reacquisition relies on a synthetic presentation-name transition that does not occur for this Pane; the initial all-bindings barrier then deadlocks until its timeout. This violates the design's requirement to end bound and correctly placed. It is more than the accepted transient title/client restart limitation.

**Not established:** the precise VS Code internal reason that this hidden merged Terminal no longer reflects the requested name. No claim is made about a specific renderer implementation, listener disposal, or an inaccessible terminal resource ID. Likewise, the report does not claim every other command becomes unusable: repeated projections needing p6B encounter the same unresolved binding, which explains the reported persistent failure for that Tab.

## Fix proposal, at the responsible owner

Repair `modules/pane-editors`' Terminal↔Tab identity/rebinding contract for **hidden surplus-merged editors**, rather than adding a feature-level retry, longer timeout, new Terminal, display-title lookup, or selection of unrelated user editors. The concrete invariant is: a live managed Terminal that survived a merge must be associated with its live replacement Tab before placement waits on that association.

The preferred direction is a verified stable identity association independent of the display-name/synthetic-name transition. If VS Code's supported public APIs cannot supply that association directly, the architect must choose and prove an owner-controlled replacement binding handshake that works for hidden merged editors. Any such handshake must preserve Terminal identity, duplicate-title correctness, file placement, and client uniqueness. This is an identity-owner change related to the pre-existing limitation tracked by #73, not a change to the whole-grid policy.

Do **not** prescribe `terminal.show()` or another `hidePaneName()` call as a proven fix: diagnostic interventions through the existing surface independently tried both and the timeout remained (`/tmp/sol-tests-5-reveal-intervention.log`, `/tmp/sol-tests-5-rename-intervention.log`). Both interventions were removed. A specific new host primitive remains an architectural question; none was silently invented or implemented in this tests-only task. The retained regression provides the gate for that fix.

## Final validation and cleanup

Task `b8abb21a8` completed and logs were inspected:

| Command | Result | Log |
| --- | --- | --- |
| `npm run typecheck` | Exit 0 | `/tmp/sol-tests-5-final-static.log` |
| `npm run lint` | Exit 0 | Same static log |
| `npm run format:check` | Exit 0 | Same static log |
| `npm test` | Exit 0; 16 files / 158 tests passed | `/tmp/sol-tests-5-final-unit.log` |
| `npm run test:extension` | Exit 1; 86 main-suite passes / 1 reproduced regression failure, fresh-window 1 pass, composition 1 pass | `/tmp/sol-tests-5-final-extension.log:264–267,352–375,552,733` |
| `git diff --check` | Exit 0 | After validation |

The final build regenerated `dist/`, removing all generated-bundle instrumentation and diagnostic interventions. A search of the owned source files and rebuilt bundle found no `[DEBUG-tab-switch]` or diagnostic `console.log`. Durable changes are limited to the two owned test files and this report; production source, other workers' changes, staging, commits, and branch state were untouched.

New domain terms: none. New hard-to-reverse decisions implemented: none. No CONTEXT/ADR entries are proposed for test authoring; any identity redesign requires coordinator/architect approval first.

Continuation: worker `sol-tests`, this pi conversation; request `requests/sol-tests-5.md`.

<!-- end of reply -->
