# Issue #74: a navigation click retires the Tab Projection

Status: **approved by the owner (2026-10-10); readiness answers from `answers/astra-arch-74-1.md` recorded below; I1 confirmed by the owner (window-wide); I7 decided by the owner (2026-10-11, answer 10)**.

Requirements: issue #74, ADR 0018, `CONTEXT.md` (Tab Projection), `map.md` in this directory. Builds on ADR 0017 and `docs/design/issue-19-tab-layout-projection/architecture.md`.

## Modules and responsibilities

```
views/sidebar/panes ──herdr.openPane──▶ PaneEditorNavigation.navigateToPane ─┐
features/reveal-pane ──herdr.openAgentPane──▶ navigateToPane ────────────────┤
features/open-tab ──herdr.openTab──▶ PaneTerminalPlacement (unchanged names) ─┤
                                                                              ▼
                                   modules/pane-editors/PaneTerminalSurfaceManager
                                   owns Pane Editors, their tabs, and the Tab Projection
```

- `modules/pane-editors/PaneTerminalSurfaceManager` is the single owner of the Tab Projection: it already owns Pane Editor identity, tabs and closing, and membership is a fact about its Pane Editors. No new module or class.
- `features/open-tab` keeps its sequence; it does not see membership.
- `views/sidebar/panes` and `features/reveal-pane` switch from `openPane` to `navigateToPane`. Other `openPane` callers (create Pane, split, create Space, run npm script) stay on `openPane` and never retire the Tab Projection (D6).

## Domain model

Tab Projection (`CONTEXT.md`): a set of the manager's managed Pane Editors, held by object identity (`Set<ManagedPaneSurface>`), so it follows `pane.moved` retargeting and drags without re-keying. A Pane Editor leaves it when it closes for any reason (the existing close path), when a navigation click retires the Tab Projection, or when a Tab click finds it outside the clicked Tab.

No persisted state. A one-Pane `herdr.openTab` call has no Tab row (the Panes View shows Tab rows only for two or more Panes), so it gets no special branch.

## Data flow

**Tab click (B2).** `OpenTabFeature` sequence is unchanged:

1. `closeDisplacedPanes(requests)`: "displaced" also covers members whose Pane is not in `requests`. Closing removes them from the set; members of the clicked Tab stay members (repeat click, D1).
2. `setEditorLayout`, wait for groups.
3. `placePanes(requests)`: each Pane Editor it creates (new or recreated after step 1) joins the set. Ones found in place keep their membership.
4. `focusPane`.

**Pane or Agent click (B3, B4)**, `navigateToPane(request)`:

1. Take the members, clear the set. `target` = the request's Pane Editor if it exists.
2. Close every former member except `target` (same close-and-wait path as `closeDisplacedPanes`).
3. If `target` was a member, is alone in its group, and another group exists → close it and wait.
4. Open as `openPane` does today: reveal an existing Pane Editor where it is, or create one in the active group.

Failure: a close that VS Code refuses or a wait that times out rejects. Both entry adapters await `navigateToPane` and show `Could not open Pane: <message>` (`errorMessage` from `@core/errors`), as `OpenTabFeature` does for Tabs; no fire-and-forget Promise. Nothing is rolled back (as ADR 0017).

## Public seams

```ts
// modules/pane-editors/paneTerminalOpening.ts
export interface PaneEditorNavigation {
  // A navigation click: retires the Tab Projection, then opens the Pane (ADR 0018).
  navigateToPane(request: PaneTerminalOpenRequest): Promise<void>;
}

// modules/pane-editors/paneTerminalPlacement.ts — names unchanged, contracts extended
closeDisplacedPanes(requests)  // + closes Tab Projection members outside requests
placePanes(requests)           // + Pane Editors it creates join the Tab Projection
```

`PaneEditorNavigation` is exported from the block `index.ts`; `extension/` passes the manager to the Panes View and `RevealPaneFeature`.

## Expected file structure

```
src/modules/pane-editors/PaneTerminalSurfaceManager.ts  changed  Tab Projection set; navigateToPane; displaced/placement extended; shared close-and-wait helper
src/modules/pane-editors/paneTerminalOpening.ts         changed  + PaneEditorNavigation
src/modules/pane-editors/paneTerminalPlacement.ts       changed  comments for the extended contracts
src/modules/pane-editors/index.ts                       changed  export PaneEditorNavigation
src/views/sidebar/panes/VsCodePanesView.ts              changed  herdr.openPane → navigateToPane
src/features/reveal-pane/RevealPaneFeature.ts           changed  openAgentPane → navigateToPane
src/extension/…                                         changed  wiring only if constructor types change
test/extension/tab-layout.test.ts                       changed  two Tab-switch tests encode the old behaviour (D5)
```

## Readiness answers (architect `astra-arch-74`, `answers/astra-arch-74-1.md`)

1. **Scope and identity.** One window-wide Tab Projection in the manager, not one per Session. Targets match by `(sessionId, paneId)`; members are managed objects, so `pane.moved` keeps them. Selecting a Session never clears it (I1, confirmed by the owner).
2. **Membership writes.** Added only in `placePanes`' create/recreate branch, as soon as the managed surface exists. Never in `openPaneSurface`, which Create/Split/npm share. Removed in `handleSurfaceClosed` for every close source; gone with the manager on dispose.
3. **Evaluation points in `navigateToPane`.** Snapshot and clear the set synchronously; close the other former members; only then read the target's current tab, its group's full tab list, and the current groups. "Something else" in the group means any other tab. No column or group count is cached across an await.
4. **Group-removal ordering (verification gate).** Surface deregistration does not prove VS Code has removed the emptied group. The implementer checks S2–S4 at this boundary in a real VS Code: if the existing close-and-wait already gives the ordering, keep it; otherwise add a bounded host-state wait for the observed condition. No arbitrary delay. Baseline: `workbench.editor.closeEmptyGroups` enabled (the default); with it disabled, empty groups stay and nothing compensates (I4).
5. **Hidden or unbound target.** Resolve through the manager map, not presence. A bound hidden target is revealed, not recreated. A member whose group must be read uses the existing bounded binding wait. Persistent orphans are #73.
6. **One-Pane `herdr.openTab`.** Not reachable by the user: the command is hidden from the palette and Tab rows exist only for two or more Panes. No branch: a direct one-Pane call projects and joins like any other (I2, decided by the design owner under the no-defensive rule).
7. **Failure and membership.** Pane navigation clears membership first, so a former member that fails to close becomes an ordinary editor; the next click does not retry it (I3). Tab retirement removes members only by a successful close.
8. **Overlapping clicks.** #19's exclusion stands: no queue, no cancellation; only settled sequential clicks are promised (I5). No disposal guards beyond existing rules.
9. **Scrollback.** S2/S4 recreation loses VS Code-side scrollback and reconnects; the Herdr Pane is untouched (I6, ADR 0018).
10. **Members outside the editor grid (I7, decided by the owner 2026-10-11, final review).** Retirement closes only members that have an editor tab; a member the user moved into the Panel stays open there. The Tab path leaves such a member in the set, so a later navigation click closes it once it is back in the grid; the Pane/Agent path drops it with the rest of the set (answer 7). Clicking that member itself still waits for its binding and times out (#73).

## Verification plan (preliminary, `testing-scenarios`)

Extension level (`test/extension/`), editor-group seam: tabs per group, terminal identity, active tab.

Critical now:

1. Tab A → Tab B (no shared Panes): A's members close, files stay. Replaces the expectation of "switches from real Tab 13 to Tab 12…" (D5).
2. Tab click then Pane row click on another Tab's Pane: all members close, the Pane opens in the remaining group next to the file (D7).
3. Clicked member scenarios S1–S4 from ADR 0018, with terminal identity: kept vs recreated (D8); includes a hidden-but-bound clicked member and a former member sharing the target's group.
4. A Pane Editor already in place before the Tab click survives the next Pane click (D1).
5. Repeat click on the same Tab, then a Pane click: the original members still close (D1, S8).
6. Split or Create Pane after a Tab click retires nothing (D6).

Optional: Agent click retires (same seam as the Pane row); a dragged member still closes (D2); a member closed by hand and later opened by Split is not closed.

Deliberately excluded: retesting VS Code's own empty-group removal (our ordering dependency on it is gate 4 above), error notification path, Reload Window (D3), private helpers.

Existing-test conflict: "switches from real Tab 13 to Tab 12…" and "returns to real Tab 12…" assert that the previous Tab's Pane Editors stay behind; both change with D5.
