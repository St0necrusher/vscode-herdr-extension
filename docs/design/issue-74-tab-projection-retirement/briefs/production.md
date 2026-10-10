# Slice `production` (#74)

Worker: `sol-impl-74` (pi). Rules, write boundary, validation, questions and report format: `briefs/common.md`. Design: `architecture.md`, `map.md`, ADR 0018.

## Task

A Pane or Agent row click retires the Tab Projection; a Tab click retires members outside the clicked Tab and records the Pane Editors it creates as the new members. Implement it in `PaneTerminalSurfaceManager` and switch the two row adapters to the new seam.

## Owned files

- `src/modules/pane-editors/PaneTerminalSurfaceManager.ts`
- `src/modules/pane-editors/paneTerminalOpening.ts`
- `src/modules/pane-editors/paneTerminalPlacement.ts`
- `src/modules/pane-editors/index.ts`
- `src/views/sidebar/panes/VsCodePanesView.ts`
- `src/features/reveal-pane/RevealPaneFeature.ts`
- `src/extension/HerdrExtension.ts` only if a constructor type change forces wiring (lines 106, 116 pass `surfaceManager`; the manager already implements the new interface, so likely no change).

`src/features/open-tab/OpenTabFeature.ts` is NOT owned: its sequence stays as is (it already calls `closeDisplacedPanes`, `setEditorLayout`, `placePanes`, `focusPane`).

## Current code (where to look)

`PaneTerminalSurfaceManager.ts`:
- `:12-17` `ManagedPaneSurface { selection, terminalName, surface, tab }`; `:22` `surfacesBySession`.
- `:44-71` `openPane` -> `openPaneSurface(request, viewColumn = activeGroup)`: reveals an existing surface if not focused, else creates one in the column, `setSurface`, `onDidClose -> handleSurfaceClosed`, reveal. Shared by Create/Split/npm; never touch membership here.
- `:73-101` `closeDisplacedPanes`: loop computing `displacedPanes()` (misplaced or in a surplus group), `waitForPaneTab` each, `tabGroups.close(tabs)` (throws `Could not close displaced Pane Editors` when false), then `waitForEditorGroups(() => getSurface(selection) !== managed ...)`, recompute until empty.
- `:103-118` `placePanes`: per cell `getSurface(request) ?? openPaneSurface(request, column)`, wait for tab in column, `terminal.show(true)`, wait active in cell.
- `:188-193` `handleSurfaceClosed` is the single close path (also via `closePanes`, `pane.moved` keeps the object, `:173-186`).
- `:135-141` `waitForPaneTab` is the bounded binding wait.

`paneTerminalOpening.ts`: `PaneTerminalOpening { openPane(request): void }`. `paneTerminalPlacement.ts`: the three-method interface. `index.ts:5-7` exports the types.
`VsCodePanesView.ts:40-41,50-54`: constructor takes `PaneTerminalOpening`; command `herdr.openPane` calls `openPane(request)` for Pane and Tab-less rows (`:183`). `RevealPaneFeature.ts:12-13,24-32`: `openAgentPane` is sync, calls `selectSpace`, then `openPane`.

## Design to implement (quoted)

Modules: "`modules/pane-editors/PaneTerminalSurfaceManager` is the single owner of the Tab Projection ... No new module or class." "Other `openPane` callers (create Pane, split, create Space, run npm script) stay on `openPane` and never retire the Tab Projection (D6)."

Domain model: "Tab Projection: a set of the manager's managed Pane Editors, held by object identity (`Set<ManagedPaneSurface>`), so it follows `pane.moved` retargeting and drags without re-keying. A Pane Editor leaves it when it closes for any reason (the existing close path), when a navigation click retires the Tab Projection, or when a Tab click finds it outside the clicked Tab." No persisted state.

Data flow, Tab click (B2): "1. `closeDisplacedPanes(requests)`: 'displaced' also covers members whose Pane is not in `requests`. Closing removes them from the set; members of the clicked Tab stay members (repeat click, D1). ... 3. `placePanes(requests)`: each Pane Editor it creates (new or recreated after step 1) joins the set. Ones found in place keep their membership."

Data flow, Pane or Agent click (B3, B4), `navigateToPane(request)`:
1. Take the members, clear the set. `target` = the request's Pane Editor if it exists.
2. Close every former member except `target` (same close-and-wait path as `closeDisplacedPanes`).
3. If `target` was a member, is alone in its group, and another group exists -> close it and wait.
4. Open as `openPane` does today: reveal an existing Pane Editor where it is, or create one in the active group.

Failure: "a close that VS Code refuses or a wait that times out rejects. Both entry adapters await `navigateToPane` and show `Could not open Pane: <message>` (`errorMessage` from `@core/errors`), as `OpenTabFeature` does for Tabs; no fire-and-forget Promise. Nothing is rolled back."

Public seams:
```ts
// modules/pane-editors/paneTerminalOpening.ts
export interface PaneEditorNavigation {
  // A navigation click: retires the Tab Projection, then opens the Pane (ADR 0018).
  navigateToPane(request: PaneTerminalOpenRequest): Promise<void>;
}
// paneTerminalPlacement.ts: names unchanged, contracts extended
closeDisplacedPanes(requests)  // + closes Tab Projection members outside requests
placePanes(requests)           // + Pane Editors it creates join the Tab Projection
```
`PaneEditorNavigation` is exported from `index.ts`; the manager implements it; `VsCodePanesView` and `RevealPaneFeature` take `PaneEditorNavigation` instead of `PaneTerminalOpening` for these two commands (if the view still needs `openPane` for other rows, check `:183` and the other `paneTerminalOpening` uses; keep what is needed, no duplicates).

## Decisions that bear on it

- D1 Members are the Pane Editors the click created or recreated; one found in place keeps its membership.
- D2 Dragging keeps membership (object identity, no group-based membership).
- D3 Memory only; lost on Reload Window.
- D5 Tab 13 -> Tab 12 closes Tab 13's members: `[p6D] [p6E]` then Tab 12 -> `[p69] [p6C] [p6A] [p6B]`.
- D6 Only Pane and Agent rows retire. Create Pane, Split, Create Space, Run npm Script do not.
- D7 Cleanup happens before opening: `[file B] [D]`, click C -> `[file C]`.
- D8 S1 `[file B][D]` click B -> `[file B]`; S2 `[file B][D]` click D -> `[file D]`; S3 `[B][D]` click D -> `[D]`; S4 `[file][B][D]` click B -> `[file B]`.
- I1 (owner: yes) one window-wide Tab Projection, members from another Session included; selecting a Session never clears it; match targets by `(sessionId, paneId)`.
- I2 No special branch for a one-Pane `herdr.openTab`: a direct call projects and joins like any other.
- I3 Pane navigation clears membership first; a former member that fails to close becomes ordinary and is not retried. Tab retirement removes members only by a successful close.
- I4 Empty-group removal relies on `workbench.editor.closeEmptyGroups` (default on); nothing forces groups closed or compensates when it is off.
- I5 No queue/cancellation; only settled sequential clicks are promised.
- I6 A recreated target loses VS Code-side scrollback and reconnects; the Herdr Pane is untouched.

Readiness answers: (1) one manager-wide set. (2) Add only in `placePanes`' create/recreate branch, as soon as the managed surface exists (before its binding wait); never in `openPaneSurface`. Remove in `handleSurfaceClosed` for every close source; the set goes with the manager on dispose. (3) In `navigateToPane`: snapshot and clear the set synchronously; close the other former members; only then read the target's current tab, its group's full tab list and the current groups. "Something else" in the group means any other tab. Cache no column or group count across an await. (5) Resolve the target via the manager map (`getSurface`), not visible presence; a bound hidden target is revealed, not recreated; for a member whose group must be read, use `waitForPaneTab`. Persistent orphans are #73. (7) above. (8) No disposal guards beyond existing rules. (9) Above.

## Expected behaviour per scenario

- Tab A (members a1,a2 created) -> Tab B with no shared Panes: a1,a2 close (and their groups go away with `setEditorLayout`); files stay; B's Pane Editors are the new members.
- Tab A -> Tab B sharing Pane x: x, found in place, keeps its membership and stays; members outside B close.
- Repeat click on Tab A: members unchanged, none closed beyond today's displaced logic.
- Tab click then Pane row/Agent row on a Pane outside the Tab Projection: all members close, then the Pane opens in the active remaining group next to the file (D7).
- S1: `[file B][D]` (B, D members), click B: D closes, B has a file in its group -> stays, not recreated (same terminal). Result `[file B]`; B no longer a member.
- S2: `[file B][D]`, click D: B closes, D's group holds only D and another group exists -> D closed and recreated in the remaining group. Result `[file D]`.
- S3: `[B][D]`, click D: B closes, its group disappears, no other group is left -> D stays (same terminal). Result `[D]`.
- S4: `[file][B][D]`, click B: D closes; B alone in its group but another group (file) exists -> B recreated in the active remaining group. Result `[file B]`.
- Clicked target hidden-but-bound, or sharing its group with another former member: handled by evaluating group state after the other closes (readiness 3, 5).
- A Pane Editor in place before the Tab click (not created by it) is not a member: a later Pane click does not close it (D1).
- D6: after a Tab click, Create Pane / Split / npm script retire nothing (they use `openPane`, unchanged).
- B5: focusing a Pane Editor in the editor area, selecting a Space or a Session retires nothing (no code path added for them).
- A member the user closed by hand leaves the set (`handleSurfaceClosed`), so a later Split opening that Pane is not a member.

## Verification gate (readiness answer 4)

Surface deregistration (`getSurface(...) !== managed`) does not prove VS Code has removed the emptied group. Before finishing, check S2, S3 and S4 at this boundary in a real VS Code: after the close-and-wait in `navigateToPane`, are the group count and the target's group as the next step reads them? An ad-hoc local check (a throwaway extension-host test or a manual run) is fine; it must not be added to or edited in committed tests, and must be deleted afterwards (leave the working tree with only owned files changed). If the existing close-and-wait already gives the ordering, keep it. Otherwise add a bounded host-state wait (`waitForEditorGroups`) for the observed condition (for example the group count dropping or the target's tab binding), with no arbitrary delay and no unconditional group-absence predicate. Report the evidence: what you ran, observed ordering, and the decision.

## Exclusions

No new or edited tests; no queue, cancellation or latest-wins; no singleton branch in `herdr.openTab` (I2); no orphan healing (#73); no live Tab tracking (#75); no rollback of partial work; no `closeEmptyGroups` compensation or setting changes; no new module/class; no membership kept anywhere except the manager's set.

## Completion criteria

- `navigateToPane` implemented and exported via `PaneEditorNavigation`; both row adapters await it and report `Could not open Pane: <message>`.
- `closeDisplacedPanes` closes members outside `requests`; `placePanes` records created Pane Editors; contracts documented in `paneTerminalPlacement.ts` comments.
- A shared close-and-wait helper serves both close paths (no copy).
- Verification gate done and reported.
- Validation per `briefs/common.md`: only the two listed existing-test conflicts fail.
- Report at `TD/reports/production-1.md` per `briefs/common.md`.
