# Issue #74 readiness challenge

## Summary

- **Owner/seam:** `PaneTerminalSurfaceManager` is the right owner for membership and Pane Editor identity; no new class is justified. Add membership only on `placePanes`’ create/recreate branch, not generic `openPaneSurface`.
- **Close/move/session:** delete membership in the existing surface-close path; keep members by object identity across `pane.moved`. Match targets by `(sessionId, paneId)` and treat the projection as global across the manager’s Sessions, as the design’s single latest projection implies.
- **Concrete design gaps:** re-read target/tab/group state after awaited closes; define what to do if the target closes or is still unbound. Full Tab and Pane navigation commands can overlap today, so a decision on serialization/latest-wins is needed.
- **Singleton:** normal Panes View clicks route singleton Tabs through `herdr.openPane`, so no Tab-click special case is needed for that UI path. But `herdr.openTab` is still registered and the tests invoke it for a one-Pane fixture; direct invocation semantics are underspecified.
- **Failure contract:** no rollback means surviving old members become ordinary, untracked Pane Editors after a failed retirement. The Pane/Agent handlers must return the navigation Promise; Open Tab currently catches and displays its own error.
- **No tests/runtime checks were run.** This is a source-only review; VS Code’s exact close/group-event timing remains unverified here.

## Findings and proposed answers

### 1. Keep membership in the manager; scope writes carefully

This is the smallest supported owner: the manager owns `ManagedPaneSurface`, its per-Session identity map, terminal-tab binding, close lifecycle, and `pane.moved` rekeying (`src/modules/pane-editors/PaneTerminalSurfaceManager.ts:12–22, 48–69, 173–194, 209–224`). `OpenTabFeature` knows the layout sequence, not the surface object identity (`src/features/open-tab/OpenTabFeature.ts:30–45`). A new projection service would duplicate this ownership.

Implement the membership write in `placePanes` only when that path creates/recreates a surface. `openPaneSurface` is shared with ordinary Pane opens (`PaneTerminalSurfaceManager.ts:44–69`), while D6 explicitly excludes Create/Split/Space/npm opens (`docs/design/issue-74-tab-projection-retirement/map.md:84`). Existing surfaces found in place must retain their prior membership, including non-membership (`architecture.md:32–35`).

Remove a member in `handleSurfaceClosed` alongside `removeSurface`; that path handles any close source, rather than only retirement initiated by the new feature (`PaneTerminalSurfaceManager.ts:188–194`). The pseudoterminal close callback is intentional: VS Code can close a moved terminal tab without `onDidCloseTerminal` (`src/modules/pane-editors/PaneTerminalSurface.ts:155–156`; verified by `test/extension/pane-editors.test.ts:240–260`).

Object identity is a good fit: `handlePaneMoved` mutates the same `ManagedPaneSurface` and rekeys its selection (`PaneTerminalSurfaceManager.ts:173–184`), so a `Set<ManagedPaneSurface>` follows moves and drags without more bookkeeping. The manager’s maps and `getSurface` already distinguish Sessions (`:22, 256–276`); use both session and Pane IDs for target equality. `allSurfaces()` spans those maps (`:256–257`), so retiring a single latest projection should include its members from an earlier Session, not only the currently selected Session. If per-Session projections are intended instead, that contradicts the present global Set description and needs an explicit product decision.

### 2. Re-evaluate the target after other members close

The required ordering is sound: close all former members first, then decide whether the clicked member is now the only tab in its group. A former member can share the target’s group; closing it can make the target newly alone. Group removal also shifts `viewColumn`s. Existing placement already documents and handles that by closing, waiting, then recomputing displacement (`PaneTerminalSurfaceManager.ts:87–100`). Apply the same principle here: do not cache the target’s column, group count, or tab list before closing other members; inspect current `tabGroups.all`/`target.tab.group.tabs` afterwards. “Group holds something else” should mean any other editor tab (file or Pane); only the target tab left means it is eligible for close when another group remains.

The close API can fail (`tabGroups.close` returning false) and editor-group waits time out after five seconds (`PaneTerminalSurfaceManager.ts:91–100, 135–140`; `src/core/editor-groups/index.ts:38–62`). For a target that qualifies for recreation, await closing its tab and confirm the old surface/tab and empty group are actually gone before opening into the *then-active* remaining group. This avoids opening into a group that is still being removed; `openPaneSurface` chooses the active group by default (`PaneTerminalSurfaceManager.ts:48–51`). The design says “close it and wait” but does not name the settled-state predicate. Verify the old tab is absent and, when applicable, its group is absent before step 4.

A hidden target is not necessarily absent: `ManagedPaneSurface.tab` is optional and `visible` only includes bound active tabs (`PaneTerminalSurfaceManager.ts:12–17, 239–253`). Resolve the target through the manager’s identity map, not `PaneEditorPresence` or active-tab state. If it is a managed surface with no tab yet, wait for binding while it remains managed; if the user closes it during an awaited retirement and the manager removes it, re-resolve and let step 4 create a fresh one instead of waiting forever on a stale object. The existing binding path can leave `tab` undefined while unbound (`:213–224`), and `waitForPaneTab` is bounded (`:135–140`).

### 3. Overlapping navigation commands are reachable

There is no pending-command guard in the tree command handlers (`src/views/sidebar/panes/VsCodePanesView.ts:50–53`; `src/features/reveal-pane/RevealPaneFeature.ts:14–31`). Tab opening yields repeatedly across close, layout, placement and focus (`src/features/open-tab/OpenTabFeature.ts:41–45`); another row click can run before that Promise settles. A concrete race: a Tab click passes `closeDisplacedPanes`, a later Pane click clears the projection and opens its target, then the earlier Tab click resumes at `setEditorLayout`/`placePanes` and adds its members after the newer click. Two Pane clicks can likewise finish in reverse order.

Decide whether navigation is serialized in click order or latest-click-wins. If serialized, the smallest safe seam is one shared queue around the *whole registered command bodies* (Tab and Pane/Agent), not independent locks around manager methods: `OpenTabFeature` has an awaited `setEditorLayout` between manager calls, outside those methods. If overlap is intentionally unsupported, say so explicitly; current UI does not disable the rows while a command is pending.

### 4. Singleton path and the one-Pane command contract

The Panes View creates a group row only for tabs with more than one Pane; a one-Pane Tab is a singleton row (`src/views/sidebar/panes/PanesModel.ts:97–102`). Group rows call `herdr.openTab`, while Pane rows—including singleton rows—call `herdr.openPane` (`src/views/sidebar/panes/VsCodePanesView.ts:153–160, 169–200, 225–227`; confirmed by `test/extension/pane-command.test.ts:179–193`). Thus the normal single-Pane UI click follows `navigateToPane` and retires the old projection without starting another.

The blanket “one-Pane `herdr.openTab` call gets no special branch” is not true for every reachable command path: the command is registered (`package.json:70`) though hidden from the palette (`:292–294`), and the layout suite invokes it for the `single` fixture (`test/extension/tabLayoutFixtures.test.ts:72–74`, `test/extension/tab-layout.test.ts:23–31, 415`). Under the unqualified ADR rule that a single-Pane Tab click starts no projection (`docs/adr/0018-navigation-click-retires-the-tab-projection.md:7–11`), the generic “new surface in `placePanes` joins” rule would incorrectly add that Pane. Either scope the rule to the actual singleton-row command path, or explicitly make one-request `openTab` retire but not start membership (including an already-member requested surface). This is an API-contract clarification, not a blocker for the normal sidebar route.

### 5. Failure and command-return behavior

The design deliberately clears membership before asynchronous closes and says not to roll back (`architecture.md:39–44`). Therefore, if a close is refused or a wait times out after some members have closed, any still-open former members are no longer members and a later navigation will not retry them. That is a coherent no-rollback policy, but state it as the expected partial-failure result; otherwise membership must be retained/restored for survivors.

Returning the Promise is necessary for the stated error contract. `herdr.openPane` currently discards its `openPane` result (`VsCodePanesView.ts:50–53`), and `herdr.openAgentPane`/`openAgentPane` are currently void (`RevealPaneFeature.ts:14–15, 24–31`). Update both handlers to return/await `navigateToPane`. The Tab command already awaits and catches errors into `showErrorMessage` (`OpenTabFeature.ts:15–20`), so its failure is user-notified rather than propagated to VS Code; decide whether Pane/Agent should rely on command rejection as drafted or use the same explicit notification policy.

## Positive evidence and limits

- The existing displaced-close loop batches tab closes and recalculates after each batch because closing lone Pane Editors removes groups and shifts later groups (`PaneTerminalSurfaceManager.ts:88–100`). Existing tests exercise misplaced/surplus terminal recreation while keeping files (`test/extension/tab-layout.test.ts:95–143`).
- Pane moves preserve the existing terminal identity (`test/extension/pane-editors.test.ts:103–135`), supporting object-based membership. Manual/moved-tab closure reaches the pseudoterminal close hook even when the ordinary terminal-close event is skipped (`PaneTerminalSurface.ts:155–156`; `test/extension/pane-editors.test.ts:240–260`).
- Two current Tab-layout tests encode the behavior D5 intentionally changes: retaining old Tab members behind the new Tab (`test/extension/tab-layout.test.ts:200–224, 226–250`). They need new expectations, as the design already notes.
- I found no evidence that hidden/inactive Pane Editors are removed from the manager merely for being inactive; the binding/presence paths distinguish “bound” from “active” (`PaneTerminalSurfaceManager.ts:209–253`). I did not test VS Code close-veto behavior, event ordering, or actual group-removal timing; no claim about those runtime details is verified here.

## Unresolved owner questions

1. Is the projection strictly global across Sessions? Current manager ownership and design wording imply yes.
2. Should a direct one-request `herdr.openTab` invocation obey the single-Pane no-projection rule, or is that command contract intentionally limited to Tab rows?
3. Should overlapping navigation queue in invocation order, cancel stale work, or be explicitly unsupported?
4. Is “group gone” an explicit wait condition before target recreation, and does no-rollback on close failure intentionally relinquish membership for surviving old terminals?

<!-- end of reply -->