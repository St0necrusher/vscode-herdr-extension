# A Herdr Tab opens as the whole editor grid

Clicking a Herdr Tab row in the Panes View makes the editor area the Tab's layout (#19). One `vscode.setEditorLayout` call gives the grid one group per Pane, with Herdr's split directions, nesting and proportions. The sizes are Herdr's cell extents, used as weights. VS Code reuses the existing groups in grid order: group `i` becomes Pane `i`'s group, and its editors stay in it. Surplus groups merge into the last group.

Pane Editors are recreated, not moved. Before the layout is applied, every Pane Editor that would change group is closed: Pane Editors of any Tab in surplus groups, and this Tab's Pane Editors outside their own group. Each missing Pane Editor is then created directly in its group. Pane Editors already in place are kept, so repeating the click recreates nothing. The Herdr-focused Pane ends focused. A failure shows an error and nothing is rolled back.

This drops the earlier guarantee that opening a Tab never moves file editors: they move with their group, or into the last group when groups merge. Their contents and dirty state are preserved. The owner chose a full-size, predictable layout over keeping the rest of the grid untouched.

## Considered Options

- **Additive projection inside the active group** (`newGroupRight`/`newGroupBelow` from the active group, file editors never moved). It was implemented first and rejected: the whole Tab gets squeezed into one cell of the existing grid, and it cannot apply Herdr's proportions.
- **Moving open Pane Editors into their groups** (`moveActiveEditor`, with a placeholder editor for move cycles). It was implemented and rejected after a bug. VS Code moves an editor by opening it in the target group and closing it in the source. The close unregisters the terminal, and it is registered again only once its editor is visible. A Pane Editor that a surplus merge moves while hidden is left orphaned: rename, `show` and `dispose` do nothing for it, its tab can never be rebound, and the next projection times out. Recreating costs about the same as a Herdr `pane.moved`, which already reconnects the client and redraws the screen from Herdr.
- **Rebinding moved tabs by pairing each target open with its source close.** It needs no visible change, but it relies on VS Code's undocumented move order and still has to heal orphans. Recreation removes the case instead.
- **A permanent identity marker in Pane Editor titles.** Rejected by the owner: the marker would always be visible.
- **An adjacent-column fallback** (#19's original criteria). Not needed: `setEditorLayout` expresses every Herdr BSP shape once same-direction splits are flattened.

## Consequences

- A recreated Pane Editor is a new `vscode.Terminal` with a new Herdr client, and its VS Code-side scrollback is gone. The Pane in Herdr is untouched.
- Closing a misplaced Pane Editor that was alone in its group removes that group before the layout is applied, so later groups shift one cell earlier. Closing repeats until no Pane Editor is displaced.
- An arbitrary group is activated by index: `focus{First..Eighth}EditorGroup`, and then `focusNextGroup` once per group beyond the eighth. Both go by grid order and work without OS window focus. There is no eight-group limit.
- Manual drags and `Join Groups` still go through the manager's synthetic-name rebind: the client restarts, the title flickers, and a hidden manual merge can orphan a Pane Editor. Tracked in #73.
- Supported baseline: the main window's grid with unlocked groups. Auxiliary editor windows, locked groups and zoom get no special handling.
