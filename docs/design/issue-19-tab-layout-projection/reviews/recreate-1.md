# Review: slice `recreate`, round 1

Reviewed: `git diff HEAD -- src test` on `feat/19-open-tab-layout` (HEAD ea3fb38), against `requests/sol-identity-1.md`, the "Recreate instead of move" section of `architecture.md`, `answers/sol-identity-q1.md`, `reports/recreate-1.md` and the `tests` skill. I did not rerun the checks; the worker reports them green.

## Brief requirements

| Requirement | Where | Status |
| --- | --- | --- |
| The manager closes Pane Editors through their bound Tab and awaits closure through the surface-closed path | `PaneTerminalSurfaceManager.ts:73-103` (`tabGroups.close(tabs)` at :95, registry-removal wait at :97-99) | Done |
| Smallest seam; the feature owns the sequence | `paneTerminalPlacement.ts:4-5` adds only `closeDisplacedPanes(requests)`; `OpenTabFeature.ts:41-45` runs close, layout, group wait, place, focus | Done |
| Remove `moveActiveEditor`, fill before drain, the untitled placeholder, cycle handling, source activation | The old `placePanes` body is gone. `rg` finds no `moveActiveEditor`, `openTextDocument` or placement placeholder in `src`. The only remaining `placeholder` hits are the reconnect screen in `PaneTerminalSurface.ts:272-288` and `paneTarget.ts`, which are unrelated | Done |
| Keep: create missing Pane Editors in their cells, show each cell's Pane Editor as active, final `focusPane` with `focusEditorGroup` | `placePanes` :110-122 (`getSurface ?? openPaneSurface(request, viewColumn)`, then `show(true)` plus an active-in-cell wait); `focusPane` :129-138 | Done |
| No guards for unrealistic cases, no flags, no sleeps; bounded event waits only | No flags and no sleeps. **Guards were added**, see below | Missing |
| Both 12/13 tests pass; the moved-identity scenarios assert recreation; harness keeps max-one-client; "no Terminal closed" becomes "only expected displaced close" | `tab-layout.test.ts:95,109,124,176,200,226`; harness :411-443 | Done |

## `closeDisplacedPanes` (:73-103)

**What it selects (:74-86).** A managed surface is displaced when either condition holds:

- it is requested and its bound Tab is not in its target column (an unbound requested surface also counts);
- it is bound in a column greater than `requests.length`.

This matches step 1 of the design. On every pass the rule reads the live columns, as `sol-identity-q1` requires.

**What it never closes:**

- File editors: only managed Tabs are collected.
- Other Tabs' Pane Editors in groups `1..n`: they are not requested, and the surplus rule needs a column greater than `n`. Closing lone groups only ever shifts columns down, so such an editor can never become surplus later in the loop.
- Correctly placed requested Pane Editors, unless an earlier batch shifted them out of their cell. That case is the approved E case.

**Tab objects stay stable across group removal.** Closing a lone group triggers a full tab-model resync. If that resync unbound the other surfaces, `displacedPanes()` would treat every momentarily unbound requested surface as misplaced and close it. I checked VS Code 1.141.0, which the tests run on. `$acceptEditorTabModel` reuses existing groups by `groupId` and `_reconcileTabs` reuses tabs by `tabId` (`extHostEditorTabs`). Bindings therefore survive, and only `group.viewColumn` changes. So the re-read is sound.

**Termination.** A batch is never empty when the loop runs. Each batch either closes every selected surface or fails:

- `close` returns false: the throw at :96, which `sol-identity-q1` authorizes;
- a surface is not removed: the 5 s timeout in the wait at :98.

Nothing is created during the loop, so the registry shrinks strictly. The loop ends after at most |surfaces| passes.

**Unbound Tab:**

- Not requested: it is never selected.
- Requested: `waitForPaneTab(managed)` at :92 waits up to 5 s for any binding, then closes the surface wherever it bound.
  - A transient rebind recovers.
  - A Panel-hosted Pane Editor or a #73 orphan never binds, and the command fails with "Timed out waiting for editor groups". HEAD failed the same way in its bindings barrier, and the case is outside this slice (#73). Not a correction.

**Observation, not blocking.** Removal from the registry happens in the pty `close` callback (`handleSurfaceClosed`). The wait at :98 re-checks only on tab and group events, so it resolves only if a tab event arrives after the pty close, or if the pty close has already happened at the initial check. Six closure scenarios pass, so the ordering holds in practice. If this ever flakes, the fix is to await the surface's close, not to add a longer timeout. One probe over the whole batch would also replace the sequential per-surface waits.

## `placePanes` (:105-123)

**Keep or create.** After preparation, every existing requested surface is already in its target column. `setEditorLayout` keeps groups `1..n` in place and merges only non-terminal editors from surplus groups. So `getSurface(request)` keeps the existing editor in place. `openPaneSurface(request, viewColumn)` creates a missing one directly in its cell. Both cases then wait for a binding in that column (:113).

**Active tab.** `terminal.show(true)` plus the wait for active-in-cell (:116-120) matches step 3. Hidden retained Pane Editors are not orphans any more, so `show(true)` works on them. The cell-nine test shows I, hidden behind A, becoming active.

**Focus last.** `OpenTabFeature.ts:45` calls `focusPane`, which runs `focusEditorGroup` and then `reveal`. This is unchanged from HEAD apart from the guards below.

## Guards and over-engineering (owner's emphasis)

The accepted HEAD `focusPane` had none of these checks, and round 1 of this feature removed exactly this kind.

The manager is not replaced while a command runs. It is disposed only on deactivation. A surface that vanishes mid-wait already fails through the bounded wait. So the repository's "still current" rule does not call for these checks.

| Location | Guard | Why remove it |
| --- | --- | --- |
| `PaneTerminalSurfaceManager.ts:93` | `requireCurrentSurface` after each `waitForPaneTab` in the batch | Re-check after an await |
| `:102` | `if (this.disposed) throw` after the loop | Disposed check mid-operation |
| `:111` | `if (this.disposed) throw` per cell | Disposed check mid-operation |
| `:114`, `:121` | `requireCurrentSurface` after each wait in `placePanes` | Re-checks after awaits |
| `:133`, `:135` | `requireCurrentSurface` added to `focusPane` | Not in HEAD; re-checks after awaits |
| `:125-127` | The `requireCurrentSurface` helper itself | Exists only for the checks above |

Kept as authorized: `if (!closed) throw` at :96 (`sol-identity-q1`: "A refused or failed closure must fail preparation"), and `requireSurface` at :131 (a lookup from HEAD).

No flags, sleeps, retry budgets or persistent placement state. Production code is not bent for tests. No new export beyond the seam method.

## Tests

Every changed scenario runs through the real command, feature, manager, surfaces and VS Code groups and Terminals. Expectations are literal.

**`recreates a lone misplaced Pane Editor in its assigned cell` (:95).** C starts alone in column 1.

- The harness asserts that the old C closed and left `window.terminals`.
- `notStrictEqual` checks the new C.
- The literal shape and `[["A"],["B"],["C"]]` are asserted.

Without the closure, C would stay in column 1 and `placePanes` would time out, so the test would fail.

**`recreates both misplaced Pane Editors in a two-Pane swap` (:109).** It asserts that both A and B close, with the literal `[A]|[B]`.

**`recreates disjoint swaps and the Pane displaced by their closing groups while retaining the file` (:124).** This is the fixed-point case.

- It expects literal `[["keep.txt","A"],["B"],…,["I"]]`.
- It expects E closed, per `sol-identity-q1`.

With a single pass and no re-read, E would stay in column 1 and `placePanes(E, 5)` would time out, so the test catches loss of the loop.

**`recreates a misplaced Pane Editor from inactive cell nine…` (:176).**

- A closes, I keeps its Terminal (`strictEqual`), and focus ends in column 9 on I.
- It no longer exercises source activation, which is removed. It now covers closure of an editor in a group beyond eight, showing a hidden retained editor, and focus beyond eight.

**`switches from real Tab 13 to Tab 12…` (:200).** Unchanged control.

- Nothing closes, because `p6D` and `p6E` sit in columns ≤ 4.
- The harness's closure check (nothing expected) plus `strictEqual` on d and e prove that other Tabs' editors in `1..n` are kept.

**`returns to real Tab 12 by recreating surplus Pane Editors…` (:226).** The regression.

- On 12 → 13, p6A and p6B close. They are another Tab's editors in surplus columns 3 and 4.
- p69 and p6C stay behind. The intermediate tabs are literal.
- On 13 → 12, p6A and p6B are created anew, and the four other Terminals are `strictEqual`.
- Shape, literal tabs and focus (column 3, p6A) are asserted.

Without the surplus closure, the hidden merge returns, and both the no-errors assertion and the closure assertion fail.

**Harness (:411-443).**

- An explicit expected-closed set.
- Each owned Terminal must be closed exactly when expected and present in `window.terminals` exactly when not.
- One live Terminal and one Tab per live Pane.
- Requested Panes active.
- Max one simultaneous client per Pane, kept.

The old `ownedTerminals.size === panes.length` became uniqueness over live Terminals, which with the closure check is at least as strict. The repeat-click test (:159) now also proves that nothing closes. No assertion was weakened, and no placeholder concept remains.

**Kept scenarios:** shape and focus over all fixtures, including beyond eight; the owner example; the dirty surplus merge; fewer groups; 2:1. They are unchanged and still literal.

## Verdict

Corrections (one round):

1. Remove the guards listed above. In `PaneTerminalSurfaceManager.ts`, delete:
   - `:93`, `:102`, `:111`, `:114`, `:121`, `:133` and `:135`;
   - the `requireCurrentSurface` helper (`:125-127`).

   `focusPane` returns to its HEAD form. No behaviour or test change is expected; rerun the full validation.

Optional, not blocking:

- The comment at :89 explains the wrong thing. The reason worth stating is "closing a lone Pane Editor removes its group and shifts later groups, so displacement is re-read after each batch", and it belongs at the `while`.
- The interface comment (`paneTerminalPlacement.ts:4`) says what the method does but not why. "A terminal editor merged while hidden is orphaned by VS Code" is the non-obvious reason.

Otherwise accept: the design, the fixed point, the seam and the tests are correct.
<!-- end of reply -->
