# Slice `tab-projection` (scenarios 1-8, optional a, b)

Read `briefs/tests-common.md` first. Starts after slice `fixtures` is accepted (typecheck and lint green). Report: `TD/reports/tab-projection-1.md`.

## Owned files

`test/extension/tab-layout.test.ts`, `test/extension/agents-navigation.test.ts` (the latter only for optional (a), and only the minimum fixture addition it needs). Fixtures in `tabLayoutFixtures.test.ts` are read-only: use `tab13` (`w3:t40`, Panes `p6D` top, `p6E` bottom; focused `p6E`) and `tab12` (`w3:t4Z`, Panes `p69` and `p6C` left column, `p6A` and `p6B` right column) as the two real Tabs, `withLayout(fixture, run, [otherFixtures])` for the harness.

## Seam and vocabulary

Seam: the real `OpenTabFeature` command (`harness.openTab`), the real manager's public `navigateToPane`, `manager.openPane` (= Create/Split/npm path, D6), and the editor groups (`groupTabs()`, `editorGroupShape()`, terminal identity via `paneTerminal(id)`, `vscode.window.terminals`). Members of the Tab Projection are Pane Editors the multi-Pane Tab click created or recreated (D1); a Pane Editor found in place is not. Never assert membership directly, only what closes or survives. Layout results are in groups, e.g. `[["file.txt","p6D"],["p6E"]]` = two groups; a Pane Editor tab listed after its file (files stay behind, see test "turns left/right file groups…" at `tab-layout.test.ts:42`).

## Harness extension (`withLayout`, `tab-layout.test.ts:273+`, `LayoutHarness` at line 17)

1. Add `navigateToPane(paneId: string): Promise<void>` to `LayoutHarness`: find the Pane in `snapshot.panes`, call `manager.navigateToPane(paneTerminalOpenRequest(sessionId, pane, paneId))` (same request construction as the harness `openPane` at ~line 450), then run the same post-conditions as `openTab` (below). A rejection fails the test.
2. Retired members must be declared before the action with `harness.expectClosed(...)`. The existing invariants stay: "only expected displaced Pane Editor closes" (`closed.has(terminal) === expectedClosed.has(terminal)`), "only retained Terminals stay open", exactly one live Terminal per open Pane, each live Pane appears once in the tabs, no simultaneously live clients, `errors` empty for `openTab`. Extract the shared post-conditions from `openTab` into one helper used by both `openTab` and `navigateToPane` (for `navigateToPane` the "target Pane is its cell's active tab" check applies to the target only).
3. A Pane Editor moved into the Panel (scenario 8) is open but has no editor tab. Add one small declaration, `harness.expectInPanel(...terminals)`, that excludes those terminals from the "appears once in the tabs" and "wait for title" checks while keeping them in "stays open / not closed". Do not weaken any other check.

## Scenarios (all in `tab-layout.test.ts`; test names in CONTEXT.md vocabulary)

Let `file` = an untitled document opened with `openDocument("file.txt", 1)` after `setGroups(2)` where stated. Expected `groupTabs()` literals come from map.md D5/D7/D8 and ADR 0018.

**1. D5 rewrite** (replaces "switches from real Tab 13 to Tab 12…", `tab-layout.test.ts:200`). Setup: `withLayout(tab13, …, [tab12])`; `openTab("w3:t40")`; assert `[["p6D"],["p6E"]]`; keep `d`, `e` = their terminals; `harness.expectClosed(d, e)`. Action: `openTab("w3:t4Z")`. Expect: shape `{orientation: 0, groups: [{orientation: 1, groups: ["p69","p6C"]}, {orientation: 1, groups: ["p6A","p6B"]}]}`; `groupTabs()` = `[["p69"],["p6C"],["p6A"],["p6B"]]` (map D5: not `[p6D p69]…`); `d` and `e` not in `vscode.window.terminals`; active group column Three, active tab `p6A` (keep from the old test).

**2. Delete** "returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13" (`:226`). Before deleting, check each assertion for one that is still valid and covered nowhere else: its identity checks (`p69`/`p6C` kept, `p6A`/`p6B` recreated, `p6D`/`p6E` kept) all encode the retained-behind premise and are now invalid; identity-kept-in-place is already covered by "repeating the Tab action preserves placement and every Pane Editor identity" (`:159`) and recreation by `:95`-`:143`. If you find a unique still-valid assertion, carry it into scenario 1 and name it in the report; otherwise delete without replacement and say so.

**3. D7 navigation click closes members before opening the Pane.** Setup: `withLayout(tab13, …, [tab12])`; `setGroups(2)`; `openDocument("file.txt", 1)`; `openTab("w3:t40")`; assert `[["file.txt","p6D"],["p6E"]]`; keep `d`, `e`. Action: `expectClosed(d, e)`; `harness.navigateToPane("p69")` (a Pane of another Tab). Expect `groupTabs()` = `[["file.txt","p69"]]` (map D7: `[file B] [D]`, click C -> `[file C]`); `d`, `e` closed; `file.txt` tab still present and not dirty-lost (document still open, group tab present).

**4. D8 clicked member, identity (S1-S4)** — one test per case, same setup style, `expectClosed` for every terminal expected to close:
- S1 `[file p6D][p6E]` (as in 3), click `p6D`: `[["file.txt","p6D"]]`; `paneTerminal("p6D")` strictly equals the original (kept); `p6E` closed.
- S2 same arrangement, click `p6E`: `[["file.txt","p6E"]]`; `p6E` is a new Terminal (`notStrictEqual` the original, original closed); `p6D` closed.
- S3 no file, `[["p6D"],["p6E"]]`, click `p6E`: `[["p6E"]]`; same Terminal kept; `p6D` closed.
- S4 `[file][p6D][p6E]`: project Tab 13 (as S1 setup), then create a third, leftmost group holding only the file by real host operations so that `groupTabs()` = `[["file.txt"],["p6D"],["p6E"]]` before the click (e.g. `workbench.action.newGroupLeft` and moving/opening `file.txt` there; assert the literal first, with a bounded wait). Click `p6D`: `[["file.txt","p6D"]]`; `p6D` is a new Terminal; `p6E` closed. If this arrangement cannot be made deterministic, ask the architect (do not substitute a different arrangement silently).
- Hidden-but-bound target: a clicked member that is a background tab of its group (a document made active in the same group after projection, e.g. `openDocument("file.txt", 1)` after the Tab click, so the group is `["p6D","file.txt"]` with `file.txt` active) is revealed, not recreated: click `p6D`; identity kept, `p6D` is the active tab, `p6E` closed, `file.txt` stays.
- **Shared-group clicked member (architect refinement):** a former member sits in the same group as the clicked member, so the clicked member's outcome depends on the group state after the other closes. Build it by moving `p6E` into `p6D`'s group with a real host command (e.g. focus `p6E`, `workbench.action.moveEditorToPreviousGroup`; assert `[["p6D","p6E"]]` first), then click `p6D`: the group held another tab (`p6E`) at click time but not after it closed. Expected per architecture answer 3 (evaluated after the others close, "something else" = any other tab) and ADR 0018: `p6D` stays, `[["p6D"]]`, identity kept, `p6E` closed. Do not read tab counts before the close settled.

**5. D1 a Pane Editor already in place survives.** Setup: `harness.openPane("p6D", 1)` (existing Pane Editor, not created by the Tab click), then `openTab("w3:t40")`: `p6D` is found in place (identity kept), `p6E` is created. Action: `harness.navigateToPane("p69")`, `expectClosed(p6E terminal)` only. Expect `p6D` same Terminal still open, `p6E` closed, `[["p6D","p69"]]` (p69 opens in the remaining active group); adjust the literal only for the active group if the focus fact is demonstrably the cause, and say so.

**6. S8 repeat click keeps the Tab Projection.** `openTab("w3:t40")` twice (second is a no-op on identities); then `expectClosed(d, e)` and `navigateToPane("p69")` with `file.txt` setup as in 3. Expect `[["file.txt","p69"]]`, both original terminals closed.

**7. D6 plain open retires nothing, and the next navigation still retires.** Setup as 3 (`file.txt`, projected Tab 13). Action A: `harness.openPane("p69", 1)` (the Create/Split/npm path). Expect no Terminal closed (`d`, `e` open, same identity), `p69` open. Action B: `expectClosed(d, e)`; `harness.navigateToPane("p6C")`. Expect `d`, `e` closed, `p69` (ordinarily opened, not a member) same Terminal still open, `p6C` open next to it; assert the group literal you observe against ADR 0018 (`p69` and `p6C` in the remaining group, `file.txt` stays) and state the literal in the report.

**8. I7 Pane Editor moved into the Panel (final-review regression; architecture answer 10).** Reference for the host operation: production-3 (`reports/production-3.md:43-48`) used `workbench.action.terminal.moveToTerminalPanel` on the focused Pane Editor and waited with the bounded host-state wait until the same managed terminal had no editor tab, the grid had one group and the original terminal was still live. Do the same: focus `p6E` (it is the Tab's focused Pane), execute the command, `waitForEditorGroups` until no tab labelled `p6E` exists, assert `[["p6D"]]` and that the original `p6E` terminal is still in `vscode.window.terminals`, then `harness.expectInPanel(e)`. Each trigger starts from its own fresh projection (separate `withLayout` runs; do not chain Tab then Pane):
- 8a Tab trigger: then `expectClosed(d)`; `openTab("w3:t4Z")` succeeds with no error, `[["p69"],["p6C"],["p6A"],["p6B"]]`, the Panel terminal `e` is still open (same identity).
- 8b Pane trigger: then `expectClosed(d)`; `navigateToPane("p69")` resolves, `d` closed, `e` still open, `p69` opens in the grid (`[["p69"]]`).
- 8c Membership after return, Tab path: continue 8a: return `e` to the editor grid with a real host operation (`workbench.action.terminal.moveToEditor` with `e` focused; wait with `waitForEditorGroups` until a tab labelled `p6E` exists again and `e` is the same Terminal). Then `expectClosed(e, <current members of Tab 12>)` and perform an unrelated navigation (`navigateToPane("p6D")` or the like): the returned `e` closes (it stayed a member; answer 10).
- 8d Membership after return, Pane path: continue 8b: return `e` the same way, then an unrelated `navigateToPane` of another Pane: `e` stays open (it was dropped from the set by the Pane/Agent path and is ordinary).
If there is no deterministic return-to-editor operation (the terminal does not get an editor tab back, or the manager does not rebind it within the bounded wait), do not assert through private state or sleep: skip 8c/8d, keep 8a/8b, and report a bounded verification gap with the evidence.

## Optional (selected)

**(a) Agent click retires**, in `agents-navigation.test.ts`: with the real manager, a projected multi-Pane Tab (wire the real `OpenTabFeature(navigationContext, manager)` the way `tab-layout.test.ts` does, registered under the harness prefix, over a Tab with two Panes of the existing fixture such as the `tab-a2` Panes; the minimum fixture addition only), then `vscode.commands.executeCommand(`${harness.prefix}herdr.openAgentPane`, "pane-b")`. Expect the projected Pane Editors closed and `pane-b` open, via the group/terminal observation helpers that file already has (`waitForPaneTab`, `waitFor`). It checks the Agent adapter, not the Pane-row routing (kept in `pane-command.test.ts`).

**(b) D2 a dragged member still closes**, in `tab-layout.test.ts`: project Tab 13 with `file.txt` as in 3; move member `p6E` to another group with a real host command (e.g. focus it, `workbench.action.moveEditorToPreviousGroup`); then `expectClosed(d, e)` and `navigateToPane("p69")`. Expect both members closed regardless of group; `[["file.txt","p69"]]`.

## Exclusions

Hand-closed member then Split, cross-Session, close-failure injection, error UI, Reload Window, private helpers, Panel-member target timeout (#73).

## Done when

All approved scenarios exist (8c/8d possibly reported as a verification gap), obsolete tests removed, no production file touched, and `npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension` pass except the baseline fresh-window focus test. Report the scenario-to-test map, the literals you could not take verbatim from this brief, and any production defect found.
