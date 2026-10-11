# moved-member — diagnosis and blocked fix

- **Status: blocked; completion criteria not met.** Both unchanged tests still fail; no production fix retained.
- **Cause of the failed assertion:** VS Code 1.141.0 omits `onDidCloseTerminal` and retains a disposed moved Terminal in `window.terminals`, despite correctly closing its editor tab and PTY.
- Manager membership and current-tab selection are correct after settling (`PaneTerminalSurfaceManager.ts:54–72,124–133`).
- Surface closure/disposal completes (`PaneTerminalSurface.ts:155–156,215–225`); the retained Terminal rejects `show()` as already disposed.
- Both isolated reproductions: 0 passed / 1 failed, `only expected displaced Pane Editor p6E closes`.
- Terminal-first experiment: 0 passed / 2 failed; it did not repair the missing event/retained enumeration and was reverted.
- Architect `answers/sol-fix-74-q1.md` reclassifies the settled failure as host-lifecycle/test-oracle conflict, not demonstrated membership loss.
- Existing C10 (`test/extension/pane-editors.test.ts:240–263`) explicitly documents the same host behavior and checks client/tab closure instead.
- Full validation: typecheck/lint/format passed; unit 16 files / 158 tests passed; extension 98 passed / 2 failed; composition 1 passed; fresh-window 0 passed / 1 known baseline failed.
- Tests unchanged; diagnostics removed; both owned production files have an empty diff against HEAD.
- **Question:** coordinator authorization is needed for test-oracle review or a separate upstream-host investigation; no event spoofing or #73 repair undertaken.
- New domain terms / hard-to-reverse decisions: none; no CONTEXT or ADR entry proposed.

## Contract and scope

Request: `requests/sol-fix-74-1.md`; approved design: `architecture.md` answers 2, 3, 7, 10, D2, ADR 0018. Work stayed on `feat/74-retire-tab-projection`, in the main checkout. No branch changes, staging, commits, pushes, test edits, architecture edits, or other workers' changes were made by this worker.

Owned source files were temporarily instrumented, then restored exactly:

- `src/modules/pane-editors/PaneTerminalSurfaceManager.ts`
- `src/modules/pane-editors/PaneTerminalSurface.ts`

The surface was instrumented because only its PTY callback, disposal, and client-stop boundary can distinguish closing an editor tab from releasing the owned client/Terminal. Its production binding/lifecycle was not modified permanently. Durable worker artifacts are this report and `requests/sol-fix-74-q1.md`; the architect authored the answer and recorded its decision separately.

## Tight reproduction and hypotheses

The supplied tests already form the minimized loop. Before instrumentation, ran:

```sh
node esbuild.mjs && npx vscode-test --config .vscode-test.mjs --label extension \
  --run dist/test/extension/tab-layout.test.js \
  --grep 'a dragged Tab Projection Pane Editor still closes on navigation|clicking a projected Pane Editor that shared a group keeps its identity after the other closes'
```

Result: **0 passed / 2 failed**. Dragged member failed `only expected displaced Pane Editor p6E closes`; the following shared-group test timed out waiting for editor groups. The two tests were then reproduced independently in fresh hosts, so the primary failure is not inferred from a cascading combined-run timeout.

Ranked hypotheses, stated before instrumenting:

1. Membership lost during rebind: moved surface would be absent from the snapshot. **Refuted.**
2. Stale Tab selected for closure: selected object would be absent from the current grid. **Refuted.**
3. Host closes tab/PTY but does not finish its Terminal registry/event lifecycle: true close result, surface disposal, retained Terminal, no close event. **Confirmed in both isolated cases.**

All throwaway logs used `[DEBUG-74move]`; none remain in `src` or `test`.

## Observed move → rebind → retirement → close

Real VS Code host: **1.141.0**, macOS arm64. Herdr clients in these extension fixtures are controlled clients, not live server attaches.

| Boundary | Dragged-member case | Shared-group case |
| --- | --- | --- |
| Move | p6E moves to p6D's group, same owned surface/Terminal | Same |
| Rebind | Prior Tab disappears; synthetic-name unbind/rebind settles | Same |
| Membership | p6E remains a member throughout | Same |
| Navigation snapshot | p6D, p6E; both Tabs current by object identity | p6D, p6E; both Tabs current by object identity |
| Selected for closing | p6D and p6E (target is p69) | p6E only (target is p6D) |
| `tabGroups.close` | true | true |
| PTY close | Fires for both | Fires for p6E |
| Manager deregistration | Both removed, surface.dispose invoked | p6E removed, surface.dispose invoked |
| Current grid after close | `[[file.txt]]`; p69 subsequently opens | `[[p6D]]`; existing target remains bound |
| Original moved Terminal | Still enumerated, no close event | Still enumerated, no close event |
| Non-moved Terminal | p6D emits close event and leaves enumeration | p6D closes normally in harness teardown |

No stale/current Tab ambiguity or equal-title identity heuristic is needed for this settled reproduction. The original p6E binding has recovered before navigation; I7 does not skip it. The discarded transient-unbound interpretation from earlier reports is insufficient once the public-state settling wait is present.

Resource probe on the **original tab-first close path** additionally showed in each fresh host:

- p6E's client `stop()` completes at closure; the controlled fixture decrements its live count synchronously in stop (`test/extension/tab-layout.test.ts:629–649`).
- p6E's surface reaches `client.kind === "idle"` during disposal; the disposed guard prevents convergence from reopening a client.
- `terminal.dispose()` is invoked. A temporary immediately following `terminal.show(true)` probe throws **“Terminal has already been disposed”** from VS Code's `_checkDisposed`.
- At close resolution, the p6E surface is no longer registered, no p6E editor tab exists, yet the disposed Terminal still appears in `window.terminals`.

Thus observed extension resources are released; the retained API object is not a usable extension Terminal. This does not establish that every internal VS Code allocation is freed: there was no host heap analysis or live-Herdr process inspection. It does distinguish the registry/event symptom from a surviving Pane Editor or running controlled client.

### Relevant source boundaries (restored line numbers)

- `PaneTerminalSurfaceManager.ts:54–64`: snapshot/clear membership, select bound non-target members.
- `PaneTerminalSurfaceManager.ts:124–133`: close current bound tabs, reject false, bounded wait for surface deregistration.
- `PaneTerminalSurfaceManager.ts:226–231`: remove membership/map/selection, dispose surface.
- `PaneTerminalSurface.ts:155–156`: existing comment and PTY-close signal explicitly account for missing host close events after group moves.
- `PaneTerminalSurface.ts:215–225`: idempotent cleanup and `terminal.dispose()`.
- `PaneTerminalSurface.ts:386–400`: stop owned client and set idle.
- `test/extension/tab-layout.test.ts:730–733`: the failing oracle demands both close-event receipt and removal from `window.terminals` for every expected closed Terminal.
- `test/extension/pane-editors.test.ts:240–263`: C10 explicitly recognizes tab/PTY/client closure despite missing close event and stale Terminal enumeration.

## Terminal-first experiment and architect ruling

Consulted `astra-arch-74` via `requests/sol-fix-74-q1.md`; reply `answers/sol-fix-74-q1.md` is complete.

The architect authorized an experiment, **not production acceptance**, because unconditional Terminal disposal before `tabGroups.close` could pre-empt the approved close-refusal semantics. The answer narrows the prior ruling: after this concrete trace, failure of the event/enumeration oracle is not proof of membership/retirement failure. If no bounded lifecycle adjustment repairs the host behavior, report and request oracle review rather than expanding into #73.

Experiment: after resolving current tabs in `closePaneEditors`, temporarily call each known owned `surface.terminal.dispose()` before the original `tabGroups.close(tabs)`, retaining the original close result and deregistration waits. No delays, retries, new seams, or title-based rebinding.

Result: **0 passed / 2 failed**. In both traces, the current p6E tab closes, PTY close/disposal occur, and `tabGroups.close` returns true, but the moved Terminal still lacks its close event and stays enumerated. The dragged case fails the same close assertion; the combined shared-group test reports a settling timeout. Separate original-path isolated traces establish its primary close assertion independently. No changed refusal behavior was accepted or retained; the experiment was reverted.

### c989928 clue

I did **not** rerun c989928. The earlier worker's observation (moved tab removed, Terminal still listed) is consistent with the now-observed current settled lifecycle: the tab/PTY is closed, surface deregistered/disposed, and the host close event is missing. That clue is explained without assuming lost membership or stale tab selection. The current I7 filter can skip an unbound member before settling, but that is not the failure in these settled tests.

## Durable run evidence

All paths below are relative to the repository; outputs are preserved by the harness:

| Run | Output under `.pi/tasks/01a12a8d-2b97-724a-b478-7a32ba5c268a-44445/` | Result |
| --- | --- | --- |
| Uninstrumented two-test baseline | `bd665fb15.output` | 0 passed / 2 failed |
| Isolated dragged tab-first trace | `bfb264215.output` | 0 passed / 1 failed |
| Isolated shared-group tab-first trace | `b52cbba83.output` | 0 passed / 1 failed |
| Terminal-first experiment | `b9714cd39.output` | 0 passed / 2 failed |
| Original-path cleanup probes, two fresh hosts | `b9fcddeb9.output` | Each 0 passed / 1 failed |
| Full restored-source validation | `bc4d5492c.output` | Unit 158/158; extension 98 passed / 2 failed; fresh-window 0 passed / 1 failed; composition 1/1 |

Each isolated case uses the initial command with `--grep` set to its exact single test name. Cleanup probes run the two single-name commands sequentially, each launching a fresh host.

## Validation and cleanup

Ran the complete required sequence against restored, uninstrumented production source:

```sh
npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension
```

| Command / suite | Exact outcome |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0 |
| `npm run format:check` | Passed, exit 0; all matched files formatted |
| `npm test` | Passed, exit 0; **16/16 files, 158/158 tests** |
| `npm run test:extension` build/typecheck | Passed |
| Extension host suite | **98 passed / 2 failed** |
| Fresh-window suite | **0 passed / 1 failed** (known baseline exception) |
| Real Herdr composition suite | **1 passed / 0 failed** |
| Whole validation command | Failed, exit 1 |

Extension host failures:

1. `a dragged Tab Projection Pane Editor still closes on navigation` — `only expected displaced Pane Editor p6E closes`, `false !== true`.
2. `clicking a projected Pane Editor that shared a group keeps its identity after the other closes` — `Timed out waiting for editor groups` in the full sequential run. Both fresh-host isolated runs fail the close-event oracle, as documented above.

Fresh-window failure: `The first Pane Editor of a window` → `takes keyboard focus from the Panes View` — `Timed out waiting for the Pane Editor to report keyboard focus`. This is the baseline exception named in the assignment, not a new diagnosis or permission to ignore the two moved-member failures.

Existing C10 passed in this full run. The other clicked-member/retained-target scenarios also passed; no correction was applied to make them do so. The two pre-D5 obsolete Tab-switch tests have already been replaced by the test owner, so they are not current existing-test conflicts.

Verified after cleanup:

- `git diff --exit-code -- src/modules/pane-editors/PaneTerminalSurfaceManager.ts src/modules/pane-editors/PaneTerminalSurface.ts` — exit 0, no production diff.
- `rg -n 'DEBUG-74move' src test` — no matches.
- No test, helper, snapshot, test configuration, public seam, or design decision changed by this worker.
- Repository-wide `git diff --check` reports only `docs/design/issue-74-tab-projection-retirement/progress.md:134: new blank line at EOF`; this coordinator/architect-owned file was left untouched. The owned source diff is empty.

## Questions / needed changes

1. **Coordinator decision required:** authorize the test owner to reconcile the moved-Terminal close oracle with C10 and these observations, or commission a separate upstream VS Code lifecycle investigation. A replacement oracle should still prove current editor-tab removal, manager/presence removal, client stop, retained-target identity, and eventual correct grid. Do not merely remove all close checks or weaken ordinary, non-moved Terminal coverage. I have neither edited nor pre-approved those assertions.
2. If removal of the disposed object from VS Code's terminal registry is itself a product requirement, name that explicitly and scope its research separately. No verified minimal production correction exists within this request; Terminal-first did not fix it.

No accepted amendment, new domain term, or hard-to-reverse production decision was introduced. Domain-modeling review therefore proposes **no CONTEXT.md entry and no ADR**. Architectural/test-oracle acceptance remains with the coordinator/design owner. This diagnosis is not completion or acceptance of issue #74.

<!-- end of reply -->
