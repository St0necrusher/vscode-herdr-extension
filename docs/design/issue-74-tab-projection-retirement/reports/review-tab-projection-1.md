# Slice review: `tab-projection` (#74), round 1

## Summary

- **Verdict: accept.** No corrections required. Three non-blocking notes for the coordinator are listed below.
- Every approved scenario has a test: 1–8 (8a–8d included, no verification gap), shared-group, hidden-but-bound, optional (a) and (b). See the map below.
- The literals are taken verbatim from map D5/D7/D8, ADR 0018 and the brief. The D6 literal `[["file.txt","p69","p6C"]]` is observed, matches ADR 0018 (`p69` and `p6C` in the remaining group, file stays), and is stated in `tab-projection-1.md`.
- Diff scope: only `test/extension/tab-layout.test.ts` and `test/extension/agents-navigation.test.ts` changed. No `src/`, `esbuild.mjs` or fixture-file changes.
- Harness: the postconditions for ordinary terminals are unchanged: no errors, one live Terminal per Pane, a title wait, each live Pane appears once, the target is active, closed matches expected-closed, retained Terminals stay in `window.terminals`, at most one live client.
- `expectInPanel`: justified by host behavior. While a member is in the Panel it is unbound, so `hidePaneName` gives it the synthetic title and no editor tab. It stays under the open/not-closed checks. Once it has an editor tab again, the title and appears-once checks apply to it again (`tab-layout.test.ts:708-714`).
- `expectClosedAfterMove`: the C10 oracle (no editor tab for the Pane, live client count 0), backed by the `moved-member-1` trace and `answers/sol-fix-74-q1.md`. It is not a weakening. It applies only to the two moved members, and every other terminal keeps the event/registry oracle.
- `getOwnedTerminal`: harness bookkeeping that works around the stale disposed `p6E` VS Code keeps listing after the D2 test. It reads no production state.
- `waitForPaneEditorRebind`: a bounded wait on the public presence (`manager.getPaneEditorPresence()`). Source trace: after a group move the tab already shows `p6E` while it is unbound (#73), so a wait on the label alone is not enough.
- No private-state assertions, no casts, no collaborator call counts, no sleeps. All waits are `waitForEditorGroups` or the file's existing bounded `waitFor`.
- Deleted test ("returns to real Tab 12…"): its identity and retained-behind assertions are invalid under D5. Its focus assertion (column Three, `p6A`) is kept in scenario 1. One still-valid assertion is not carried over, see note N1 (non-blocking).
- Over-engineering: none by the Evidence bar.
- Notes: N1 the Tab-path case "fewer cells after a larger projection" is no longer covered. N2 the moved-close oracle depends on each test's group literal to catch a survivor with the synthetic title. N3 the shared postconditions add an unmentioned active-tab wait, which is justified.

## Scenario-to-test map

| # | Scenario | Test | Literals / checks |
| --- | --- | --- | --- |
| 1 | D5 rewrite | "a Tab navigation click retires the previous Tab Projection", `tab-layout.test.ts:206` | shape `{0,[{1,[p69,p6C]},{1,[p6A,p6B]}]}`; `[["p69"],["p6C"],["p6A"],["p6B"]]`; `d`,`e` declared closed and absent; column Three, active `p6A`. ✓ |
| 2 | Delete obsolete return-to-Tab test | removed (HEAD `:226`) | Report: nothing carried over. See N1. ✓ |
| 3 | D7 | "a Pane navigation click retires the Tab Projection before opening another Pane", `:233` | `[["file.txt","p69"]]`; `d`,`e` closed; `file.isClosed === false`. The literal tells the D7 order apart: opening first would give `[["file.txt"],["p69"]]`. ✓ |
| 4 S1 | `[file p6D][p6E]` click `p6D` | "clicking a projected Pane Editor with a file in its group keeps its identity", `:251` | `[["file.txt","p6D"]]`; `strictEqual d`; only `e` closed. ✓ |
| 4 S2 | click `p6E` | "clicking a lone projected Pane Editor recreates it in the remaining file group", `:268` | `[["file.txt","p6E"]]`; `notStrictEqual e`; `d`,`e` closed. ✓ |
| 4 S3 | `[p6D][p6E]` click `p6E` | "clicking a projected Pane Editor in the only group keeps its identity", `:286` | `[["p6E"]]`; same `e`; `d` closed. ✓ |
| 4 S4 | `[file][p6D][p6E]` click `p6D` | "clicking a projected Pane Editor beside a file recreates it in that file group", `:299` | Built with `focusFirstEditorGroup` + `newGroupLeft` + `openDocument(…,1)`. A bounded wait, then the literal `[["file.txt"],["p6D"],["p6E"]]` is asserted first. After the click: `[["file.txt","p6D"]]`, new `p6D`, both closed, file open. ✓ |
| 4 hidden | hidden-but-bound target | "clicking a hidden but bound Pane Editor reveals it instead of recreating it", `:320` | Setup `[["p6D","file.txt"],["p6E"]]`. After the click: `[["p6D","file.txt"]]`, same `d`, active tab `p6D`, `e` closed, file open. ✓ |
| 4 shared | shared-group clicked member (architect) | "clicking a projected Pane Editor that shared a group keeps its identity after the other closes", `:477` | Setup `[["p6D","p6E"]]` after the rebind wait. After the click: `[["p6D"]]`, same `d`, `p6E` closed through the moved oracle. Tabs are read only after `navigateToPane` settles (the manager waits for deregistration). ✓ |
| 5 | D1 | "a Pane Editor already in place survives a later Pane navigation click", `:337` | `[["p6D","p69"]]` verbatim; same `d`, still open; only `e` closed. ✓ |
| 6 | S8 | "a repeated Tab click keeps its Tab Projection until a Pane navigation click", `:356` | Identities unchanged after the second Tab click; `[["file.txt","p69"]]`; `d`,`e` closed. ✓ |
| 7 | D6 + following navigation | "plain Pane opening leaves the Tab Projection for the following navigation click", `:376` | After `openPane("p69",1)`: `d`,`e` same and open. After navigation to `p6C`: `[["file.txt","p69","p6C"]]`, `d`,`e` closed, `p69` same (the harness also requires it to stay open), file open. ✓ |
| 8a+8c | I7 Tab trigger, then return to the grid | "Tab navigation leaves a Panel Pane Editor open and retires it after it returns to the grid", `:401` | `[["p6D"]]` and `e` live before. Tab 12 gives `[["p69"],["p6C"],["p6A"],["p6B"]]`, no errors, `e` open. Return by `terminal.show()` + `moveToEditor`, with a bounded wait for a `p6E` `TabInputTerminal` tab and the same Terminal. Then `expectClosed(e, …tab12)`, navigation to `p6D` gives `[["p6D"]]`, `e` closed. ✓ |
| 8b+8d | I7 Pane trigger, then return to the grid | "Pane navigation leaves a Panel Pane Editor open and relinquishes it after it returns to the grid", `:427` | `[["p69"]]`, `d` closed, `e` open. After the return and navigation to `p6C`: `p6E` and `p69` in the grid, `e` same and open, and the harness requires `e`/`p69` not closed. The brief gives no literal for 8d, so `includes` is acceptable. ✓ |
| (a) | Agent click retires | "an Agent navigation click retires the Tab Projection before opening its Pane", `agents-navigation.test.ts:290` | Real `OpenTabFeature` under the harness prefix (`registerCommand` is patched for the whole run). The fixture adds one `tab-a2` layout only (`:179-192`). After `openAgentPane("pane-b")`: A2/A3 tabs 0, projected Terminals gone, one created Terminal, `pane-b` focused. ✓ |
| (b) | D2 dragged member closes | "a dragged Tab Projection Pane Editor still closes on navigation", `:454` | Moved with `moveEditorToPreviousGroup`, rebind wait, `[["file.txt","p6D","p6E"]]` and same `e` before. After the click: `[["file.txt","p69"]]`; `d` closed by the ordinary oracle, `e` by the moved oracle. ✓ |

8c and 8d need the returned `e` to be **bound** at the second navigation. Otherwise the I7 filter (`PaneTerminalSurfaceManager.ts:61`) would skip it and 8d would pass vacuously. Source trace: a Panel member is unbound, and `hidePaneName` gives it the synthetic name. `reconcileTabBindings` (`:252-263`) binds it again by that synthetic name, and only then calls `showPaneName`. So a tab labelled `p6E`, plus `paneTerminal("p6E") === e` (`tab-layout.test.ts:537-554`), can only be observed after the rebind. The label wait is sufficient here, unlike in the group-move case.

## Harness invariants

- Shared helper `assertNavigationPostconditions` (`tab-layout.test.ts:701-753`) is used by both `openTab` and `navigateToPane` (`:776-781`). `navigateToPane` builds its request the way `openPane` does, and a rejection fails the test. ✓
- `expectInPanel` (`:760`, filter `:708-714`): it excludes a terminal only from the title wait and from "appears once". The closed check (`:739-746`) still demands that the terminal is not closed and is still listed. ✓
- `expectClosedAfterMove` (`:733-738`) implements the oracle the coordinator chose after `moved-member-1`, the same oracle as C10 (`pane-editors.test.ts:240-263`). The client-count check is not vacuous: an unretired member that is still bound and visible keeps a live client. ✓
- `getOwnedTerminal` (`:761-768`): used in the D2 and shared-group tests. It is only needed in the shared-group test, which runs after D2 left a stale disposed `p6E` in `window.terminals`. Using it in D2 as well is harmless and consistent.
- Active-tab wait (`:716-722`): see N3.
- No arbitrary sleeps. `waitForGroupTabs`, `waitForPaneEditorRebind`, `movePaneEditorToPanel` and `movePaneEditorBackToEditor` all use `waitForEditorGroups`.

## Public seams, fakes, vocabulary

- Seams: the real `herdr.openTab` command, `manager.navigateToPane`, `manager.openPane`, the real `openAgentPane` command, editor groups/tabs, Terminal identity, and `manager.getPaneEditorPresence()` (public; already used by C6). The `live` count belongs to the harness's own fake client, as in C10.
- Fakes are unchanged, apart from the fixture layout added for `tab-a2`, which matches the existing Panes `pane-a2`/`pane-a3` and their `tab-a2`.
- Test names use Tab Projection, Pane Editor, Pane, Tab, navigation click and Agent. "relinquishes" (`:427`) is not a CONTEXT term ("drops it from the Tab Projection" would match answer 10 more closely). This is cosmetic and requires no correction.
- The deep import of the `PaneEditorPresence` type (`tab-layout.test.ts:13`) follows the existing precedent in `agents-navigation.test.ts:9`.

## Over-engineering (Evidence bar)

None found. Each harness addition has one concrete host cause and is used by approved scenarios. One small redundancy: the literal assertions right after `waitForGroupTabs`/`waitForPaneEditorRebind` (`:309-310`, `:462-463`, `:484-485`) repeat the wait condition. The brief explicitly asks to "assert the literal first", so they stay.

## Notes (non-blocking)

**N1. Deleted test: one still-valid step not carried over.** The deleted test's middle step projected Tab 13 over a Tab 12 projection and asserted the shape `{orientation: 1, groups: ["p6D","p6E"]}`. Under D5 that step is still valid, with all four Tab 12 members retired and `[["p6D"],["p6E"]]`. It was the only coverage of the Tab path retiring a larger projection into fewer cells (retired members in surplus groups). Scenario 1 covers only fewer cells → more. The architect's carry-over criterion was "file-preservation, focus, or identity" (`answers/claude-coord-74-q1.md` Q3), and this assertion is a shape, so dropping it is within the brief. `tab-projection-1.md` should still have named it rather than reporting "no unique valid assertion". If wanted, the coordinator can record it as a known coverage gap, or add it as one extra assertion block in scenario 1's suite.

**N2. The moved-close oracle matches the tab by its `p6E` label.** A member that survives retirement while unbound would have the synthetic title (`hidePaneName`), and as a hidden surface it has no client (`paneClientPolicy.ts:23`). Such a member would pass `:735-738`. Both users catch it through their full group literals (`[["file.txt","p69"]]`, `[["p6D"]]`), so the tests are not vacuous. Future users of `expectClosedAfterMove` must also assert the full group literal.

**N3. Unreported active-tab wait.** The shared postconditions now wait (bounded) until the requested Panes are active tabs before asserting it (`:716-722`). `openTab` previously asserted this right after the title wait. Justification from the source: `navigateToPane` returns after `openPane` → `surface.reveal()` → `terminal.show()` (`PaneTerminalSurfaceManager.ts:54-74`, `PaneTerminalSurface.ts:175-179`). That call does not wait for the extension host's tab model, so a bounded host-state wait is the right tool. The assertion itself is unchanged. This is not a weakening, but the worker's reports do not mention it.

**Order sensitivity (information).** VS Code keeps the disposed moved `p6E` Terminals listed, so `paneTerminal("p6E")` in any test placed after `:454`/`:477` would return a stale object. The two moved-member tests are last in the suite today, and `getOwnedTerminal` covers the one case that needs it.

## Verdict

**Accept.** No numbered corrections. N1–N3 go to the coordinator to record; none blocks the `test:` commit.

<!-- end of reply -->
