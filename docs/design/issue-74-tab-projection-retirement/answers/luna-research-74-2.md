# Issue #74 follow-up evidence

## Summary

- The existing close loop waits for the exact managed surface to leave the manager; it does **not** predicate on editor-group absence. Its loop re-reads displacement after closure.
- Prototype evidence confirms `closeEmptyGroups` behavior after a settle under the tested default, not completion by this registry-removal wait. Do not add an unconditional group-absence wait: the setting can be false.
- A bound-but-inactive target is ordinary and already revealable. A normal move may briefly unbind; the known hidden-merge orphan is persistent and out of scope (#73). Waiting alone heals neither.
- Requests capture the selected Session at command entry. Existing manager opens/placement do not revalidate it after awaits; preserve the original `(sessionId, paneId)` and the managed object identity, not the then-current selected Session.
- A continuation could mechanically create after manager disposal, but #19’s review explicitly treated deactivation as the disposal boundary and removed general mid-await guards. Follow that established lifecycle scope; don’t treat a Session switch as disposal.
- **Correction to answer 74-1:** user-click overlap is explicitly out of scope in #19, so a new serialization queue is not required absent scope expansion. Keep only the within-command re-read after closes/group changes.

## Evidence

### Close/wait predicates and group removal

`closeDisplacedPanes` selects with these live predicates (`src/modules/pane-editors/PaneTerminalSurfaceManager.ts:76–85`):

```ts
const isMisplaced = targetIndex !== -1 && managed.tab?.group.viewColumn !== targetColumn;
const isInSurplusGroup = managed.tab !== undefined && managed.tab.group.viewColumn > lastColumn;
return isMisplaced || isInSurplusGroup;
```

For each selected surface it awaits `waitForPaneTab(managed)` **without** a column constraint (`:91–93`), so that proves only that `managed.tab` is bound somewhere. It then awaits `tabGroups.close(tabs)` and throws if it returns false (`:94–95`). After that, its waiter is exactly `getSurface(managed.selection) !== managed` (`:96–98`): it proves the manager removed that surface, normally via the pseudoterminal `close` callback, not that a group disappeared. `waitForEditorGroups` checks immediately, then on tab/group events, and times out after five seconds (`src/core/editor-groups/index.ts:38–62`). The loop re-runs `displacedPanes()` after the batch to account for shifted columns (`PaneTerminalSurfaceManager.ts:88–100`).

No located integration/prototype evidence ties **that predicate** to group-removal completion. The #19 review explicitly calls it a registry-removal wait and notes closure scenarios pass (`docs/design/issue-19-tab-layout-projection/reviews/recreate-1.md:31–47`); extension tests assert the final grid after the full close→layout sequence (`test/extension/tab-layout.test.ts:95–105`), not the wait’s group predicate. The prototype’s `closeEmptyGroups` test moves the sole editor and waits with a separate 150-ms `settle()` before asserting two groups (`research/whole-grid.proto.test.ts.txt:24, 258–266`). That demonstrates the tested setting’s behavior, not this close/wait ordering.

The setting is documented as `workbench.editor.closeEmptyGroups` (default on) (`docs/design/issue-19-tab-layout-projection/architecture.md:82`). When false, closing the last tab need not remove its group; group absence is therefore not an unconditional postcondition. Keep the existing tab/surface-close wait. If #74 requires an empty group to disappear even with the setting off, that is a product-scope question, not a waiter predicate to add blindly.

### Bound-hidden, transient-unbound, orphan

- **Bound but hidden/inactive:** `managed.tab` remains the binding; `openPaneSurface` reveals an existing non-focused surface (`PaneTerminalSurfaceManager.ts:53–60`), and `placePanes` waits for its assigned tab to become active (`:103–117`). The cell-nine integration case retains the same hidden Pane Terminal and activates it in its cell (`test/extension/tab-layout.test.ts:176–196`). This needs no recovery branch.
- **Transiently unbound:** new surfaces start with `tab: undefined` until a tab event binds one (`:65–69, 209–224`); placement already awaits that ordinary creation/binding. Separately, one manual editor-group move can replace/reconcile a Tab: if the old Tab is gone before a matching replacement is found, reconciliation sets the binding undefined and a later tab event may rebind it. C8 exercises a single move and observes the interim terminal-name rebind (`test/extension/pane-editors.test.ts:183–214`). This does not require two simultaneous user actions. During #74’s own close path, the expected close callback removes the managed surface rather than leaving it transiently unbound (`PaneTerminalSurface.ts:155–156`; manager `:188–192`).
- **Known orphan:** a hidden manual merge can leave the terminal absent from VS Code’s terminal-editor registry, so the synthetic-name lookup never finds a replacement; it is not the ordinary inactive-tab case (`docs/adr/0017-herdr-tab-opens-as-the-whole-editor-grid.md:12, 22`; `docs/design/issue-19-tab-layout-projection/progress.md:125–130`). `waitForPaneTab` only waits for `managed.tab` (`PaneTerminalSurfaceManager.ts:135–140`); it cannot heal or recreate that orphan. #73 explicitly owns this unsupported manual-merge case. Do not add orphan healing to #74.

### Session identity and disposal

At command entry, Pane-row resolution accepts connected or stale snapshots and builds the request with that state’s `sessionId` (`src/views/sidebar/panes/VsCodePanesView.ts:142–149`). `OpenTabFeature` returns only for unavailable state, then builds all requests from one captured snapshot before its awaits (`src/features/open-tab/OpenTabFeature.ts:30–45`). `PaneTerminalSurfaceManager.openPane` uses the supplied request; its map lookup is keyed by Session then Pane (`:44–55, 256–261`). Neither it nor `placePanes` checks the currently selected Session after an await. Session changes are handled by `SessionsModel`; refresh clears the selected connection/state and Session switching activates another ID (`src/modules/sessions/SessionsModel.ts:163–172, 206–218`), while the surface manager subscribes to `pane.moved` and VS Code tab/group changes, not Session selection/deletion (`PaneTerminalSurfaceManager.ts:34–37`).

Therefore preserve the initiating `(sessionId, paneId)`—never reinterpret a stale Pane ID in whichever Session is selected later. If the target was already managed, retain its object identity across awaits and read its current `selection`/`tab` after `pane.moved` or tab events; the manager rekeys that same object (`PaneTerminalSurfaceManager.ts:173–184`). Aborting merely because the user selected another Session would expand #19’s explicit user-click exclusion. Actual Session replacement during awaits has no currentness token in `PaneTerminalOpenRequest`; #19 decision 7 says to apply the existing lifecycle rule if that scope is required (`docs/design/issue-19-tab-layout-projection/architecture.md:112–116`), rather than silently switching the request to the replacement Session.

Disposal is different: `dispose()` sets `disposed`, disposes surfaces, and clears the map (`PaneTerminalSurfaceManager.ts:159–168`), but `openPane`/`openPaneSurface` have no disposed check (`:44–69`). Thus a still-running `navigateToPane` continuation could create after disposal if it reaches `openPane`; source does not show in-flight Promises being canceled. The prior #19 review explicitly treated the manager as disposed only on deactivation and rejected general per-await guards (`docs/design/issue-19-tab-layout-projection/reviews/recreate-1.md:61–72`). Preserve that established assumption unless #74 is changing lifecycle scope; if it is, use one lifecycle check before creating a new resource, not recovery logic at every wait.

### Command overlap

#19 explicitly excludes “coordination with user clicks during the sequence” (`docs/design/issue-19-tab-layout-projection/architecture.md:112`). A second click while a command is pending is possible, but serialization is not a #74 readiness blocker under that accepted scope; my previous queue recommendation overstated it. Internal to one command, the real ordering is already handled by waiting for each close batch and re-reading live displacement because lone-group closure shifts columns (`PaneTerminalSurfaceManager.ts:88–100`). For the new Pane-navigation path, make the target/group decision from the current managed object and current group state after its member-close wait; no cross-command queue is implied.

<!-- end of reply -->