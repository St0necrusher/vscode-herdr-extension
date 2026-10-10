# Hidden-merge rebinding: root cause and a rebinding mechanism

## Summary

- **Root cause:** VS Code 1.141.0 removes a moved terminal editor from its terminal registry and adds it back only once it is visible. The removal happens in `TerminalEditorService.onDidCloseEditor`, which also fires for the source close of a move. The re-add happens in `onDidVisibleEditorsChange`. An editor that a merge moves while hidden is left **orphaned**. Every ext-host call by numeric id goes through `terminalService.getInstanceFromId`, which reads that registry, so these calls do nothing: the pty name (`$sendProcessProperty` → `rename`), `show`, `hide`, `dispose` and `sendText`. The pty title fallback is ignored too, because the title source is already `Api`. The active merged editor stays visible, so it is added back right away.
- **What this breaks beyond the name:** `Terminal.show()` and `Terminal.dispose()` both do nothing on an orphan. Its tab and pty stay alive after `dispose()`. `window.activeTerminal` flaps to `undefined` when the orphan is first activated. The only fix through public API is to make the orphan visible, by activating its tab.
- **Recommended mechanism:**
  1. **Pair each move's open with its close.** VS Code moves an editor by opening it in the target group, then closing it in the source, one editor at a time. When a bound Tab disappears, rebind it to the unbound terminal Tab with the same label that appeared in the same step, or failing that the most recent one. This keeps the same `Terminal`, with no deselect, no synthetic name and no client restart, so it also covers #73.
  2. **Reveal a bound but hidden Pane Editor by its Tab:** focus its group, then run `workbench.action.openEditorAtIndex`, instead of calling `Terminal.show()`. Activating the Tab also re-registers the orphan.
- **Evidence:**
  - A raw-API prototype passes 4/4. It reproduces every orphan symptom and shows that activation heals the orphan. Through a 5-group hidden merge with four twin-named terminals, a `moveActiveEditor` and a `joinTwoGroups`, the pairing binder has 10/10 decisions correct against a ground truth taken after healing. No terminal opened or closed.
  - With the manager patched, the failing regression `returns to real Tab 12…` passes. With pairing alone it still fails: the projection cannot reveal p6B.
  - The full extension suite passes 87/87 with the patch. All production changes are reverted.
- **Rejected candidates:**
  - Republishing the name, or calling `show()`: both are blocked by the registry.
  - OSC title sequences: blocked once a title is set through the `Api` source.
  - `activeTerminal` correlation: it flaps, and an orphan cannot be shown.
  - `TabInputTerminal`: it has no fields.
  - Heal, then the synthetic name: you would have to activate every unbound terminal Tab, the user's own terminals included. Kept as a fallback only.
- **Open questions:**
  1. Is it acceptable to rely on VS Code's undocumented order: open before close, one editor at a time, events delivered in order? The source supports it.
  2. Heal lazily, only on reveal, dispose or rename, or eagerly after a hidden move?
  3. Revealing an orphan without moving focus (the `show(true)` path) is unproven.
  4. Moves to the Panel or another window were not tested.

## Q1: root cause in VS Code 1.141.0

The sources were fetched at tag `1.141.0`. The paths below are relative to `src/vs/workbench/`.

1. **A merge moves editors one at a time and keeps them hidden.**
   - `mergeGroup` marks every moved editor `inactive` unless it is the active editor of the active group (`browser/parts/editor/editorPart.ts:950`).
   - `moveEditors` loops over `moveEditor` (`browser/parts/editor/editorGroupView.ts:1388-1406`).
   - Each move first opens the editor in the target (`:1503`), then closes it in the source with `EditorCloseContext.MOVE` (`:1507`). The same `TerminalEditorInput` and `ITerminalInstance` are kept; nothing is recreated.
2. **The source close unregisters the instance.** `TerminalEditorService` listens to `editorService.onDidCloseEditor`, which fires for MOVE closes too. Its own comment says "This fires when dragging and dropping to another editor". It calls `_removeInstance(instance)` (`contrib/terminal/browser/terminalEditorService.ts:96-108`), which deletes the instance from `_editorInputs` and from `instances`.
3. **Only a visible editor is registered again.**
   - `onDidVisibleEditorsChange` re-adds the first visible `TerminalEditorInput` whose instance is unknown (`terminalEditorService.ts:77-90`, `find`, so one per event).
   - That event fires only on a group's active-editor change (`services/editor/browser/editorService.ts:175-178`).
   - A Pane Editor merged while hidden is never visible, so it stays unregistered: **orphaned**.
4. **Every numeric-id API call misses an orphan.**
   - Once the terminal opens, the ext host switches the terminal's id to the renderer's numeric id (`api/common/extHostTerminalService.ts:643`).
   - `MainThreadTerminalService._getTerminalInstance` → `terminalService.getInstanceFromId` scans `instances`, which is the group, editor and background registries only (`contrib/terminal/browser/terminalService.ts:97-98, 761-776, 922`).
   - This affects `$show` (`api/browser/mainThreadTerminalService.ts:189`), `$hide`, `$dispose` (`:209`) and `$sendText`.
5. **The pty name cannot get through.**
   - `onDidChangeName` → `ProcessPropertyType.Title` (`extHostTerminalService.ts:394-395`) → `$sendProcessProperty`.
   - That handler applies the name only through `getInstanceFromId(id)?.rename(name)` (`mainThreadTerminalService.ts:452-457`). The rename uses `TitleEventSource.Api`, and for an orphan it does nothing.
   - The same property is also forwarded to the process manager, which would call `_setTitle(name, Process)`. `_setTitle` drops it, because every earlier name was applied as `Api` (`contrib/terminal/browser/terminalInstance.ts:2439-2442`).
   - OSC title sequences are blocked as well: an `Api` title clears `_messageTitleDisposable` (`:2172-2176`), so `_onTitleChange` ignores them (`:1951-1953`).
   - The result: neither the instance title, nor `Terminal.name`, nor the Tab label changes. This is what the worker observed (`terminal-name p6B`, binding undefined).
6. **Why the active one works.** p6A stays the active editor in the target group, so it is visible. The source close unregisters it, but the next active-editor change re-adds it in the same operation: the source group activating its next editor, or the source group being removed. This is the same reason `moveActiveEditor` works: the moved editor is always active in its target.
7. **Why the worker's interventions failed.** `terminal.show()` → `$show` → `getInstanceFromId` returns undefined, so nothing happens. Republishing the name goes through the same path.

### Confirmed in the prototype (raw API, no extension code)

`hidden-merge-rebinding.run.log.txt`, test "Q1":

- **Setup:** 4 groups, one pty terminal each, renamed `Disp X`. Group 1 is focused, then `setEditorLayout` reshapes to 2 groups.
- **Rename all four:** A and B, which were not moved, become `s:A` and `s:B`. C and D, which were merged hidden, keep `Disp C` and `Disp D`.
- **`D.show(true)`:** the active tab of group 2 does not change.
- **`D.dispose()`:** the pty `close` does not fire, and the `Disp D` tab stays open.
- **Healing C:** focus group 2, then `openEditorAtIndex(i)`, and rename again. The rename now works (`healed C`). `activeTerminal` goes `B → C → undefined`.
- **Control test:** the merged editor that stays active, and an editor moved with `moveActiveEditor`, both rename at once.

## Q2: mechanisms, ranked

| # | Mechanism | Verdict | Evidence |
|---|---|---|---|
| 1 | **Pair the move's open with its close**, plus **reveal by Tab** (focus group + `openEditorAtIndex`) whenever a bound Tab is hidden | **Recommended** | Raw binder: 10/10 correct, twins included. Manager patch: regression passes, full suite 87/87. Pairing alone fails the regression. |
| 2 | Heal, then the synthetic name: activate unbound terminal Tabs so VS Code re-registers them, then use today's synthetic-name rebind | Fallback only | Healing works (Q1). It does not know *which* Tab to activate, so it must touch the user's own terminals. It flickers and restarts clients. |
| 3 | Avoid hidden merges in the projection: move Pane Editors out of surplus groups one at a time (reveal + `moveActiveEditor`) before reshaping | Complement only | Moving the active editor keeps it registered (Q1 control). It does nothing for the user's own merges (`joinTwoGroups`, a multi-selection drag). |
| 4 | Correlate through `window.activeTerminal` or `onDidChangeActiveTerminal` | Rejected | Activating an orphan flaps the active terminal to `undefined` (log "activate orphan C"). `Terminal.show()` cannot drive it. `terminalEditorService.setActiveInstance` uses `findIndex` and gets -1 for an orphan (`terminalEditorService.ts:122-123`). |
| 5 | Make the name propagate: republish, `show()`, an OSC title | Rejected | Source points 4-5 above. All of these need the registry. |
| 6 | `TabInputTerminal` identity | Rejected | The class has no fields. The internal tab id is not exposed. |

### Mechanism 1 in detail

**The event order** (`api/browser/mainThreadEditorTabs.ts:291,343` forwards each model op as a separate `$acceptTabOperation`; `api/common/extHostEditorTabs.ts:371-382` fires one `onDidChangeTabs` per op).

During the 5→2 merge, the log shows `open Twin#13@2, close Twin#9@3, open Twin#14@2, close Twin#10@3, …`. Between an open and its close there can be `chg` and `groups` events, but never another open or close. `moveActiveEditor` and `joinTwoGroups` show the same pattern.

**The prototype rule** (`PairingBinder` in the `.proto.test.ts.txt`; the same rule is in the manager patch, `hidden-merge-rebinding.manager-patch.diff.txt`):

1. On every tab or group event, compute `appeared`: the terminal Tabs that were absent at the previous reconcile.
2. When a bound Tab disappears, look for a candidate that is all of these:
   - present now;
   - not bound to another surface;
   - labelled with the lost Tab's label (the label at the time it closed).
3. Pick the candidate:
   - if exactly one candidate is in `appeared` for this step, take it;
   - otherwise, if none is in `appeared`, take the single candidate in `fresh`, the set of terminal Tabs that appeared at the last step with an appearance;
   - otherwise fall back to today's synthetic-name path, which unbinds.
4. Clear `fresh` after any step in which a Tab disappeared.
5. **Twins:** every editor is moved open-then-close before the next one, so `fresh` holds a single Tab at each close. Equal display names are therefore never compared with each other. The prototype checked this with four `Twin` terminals.
6. **Same-step matching:** the "same step" branch covers a full model resync (`_createTabsModel` on adding or removing a group), where the appear and the disappear could arrive together.

**What the manager must also change for orphans.** Binding alone is not enough: the patched regression still failed while `focusPane` revealed with `Terminal.show()`. The manager needs these:

- **Reveal by Tab.** When `managed.tab` is bound but not active, focus its group, then run `openEditorAtIndex(tab.group.tabs.indexOf(tab))`. This both shows the editor and re-registers it in VS Code. The Q1 log shows that the first activation leaves `activeTerminal` undefined, so the manager should call `terminal.show()` once afterwards (it works after the heal). That keeps `herdr.activeTerminalIsPane` correct. This follow-up `show()` is not yet proven inside the manager.
- **Close by Tab.** `Terminal.dispose()` does nothing on an orphan, so a surface dispose (for example a Pane closed in Herdr) would leave a zombie tab and a live pty. Close `managed.tab` with `vscode.window.tabGroups.close` as well, or instead. This is proven only for the raw case: the reset helper closes orphans by Tab.
- **Republish the name after a heal.** A Pane renamed while its editor is orphaned keeps the old label. Republish the name the next time the bound Tab is seen active.
- **Revealing with `show(true)` in `placePanes`.** The final reveal loop uses `terminal.show(true)`, which does nothing on an orphan that is already in the right column but hidden. It needs a reveal by Tab that keeps focus where it is: focus the group, activate the Tab, then focus the previous group again. **Not proven.** The regression passed only because p6B was moved, and an active move heals the editor.

### Remaining risks

- The pairing relies on VS Code internals that are not API contracts. The source supports them and the prototype observed them.
- A user terminal that is not managed, carries exactly a Pane's display label, and was opened just before a genuine close of that Pane would be claimed wrongly. A Panel move is not affected: it opens no terminal Tab in a group, so it unbinds and deselects as #73 requires. This was not run in the prototype.
- `joinTwoGroups` logged a VS Code renderer error (`Cannot read properties of undefined (reading 'terminalInstance')` in `TerminalEditor.setInput`). The join still finished correctly, and every binding was right afterwards.

## Q3: prototype

- **Raw-API test** (`hidden-merge-rebinding.proto.test.ts.txt`):
  - 4 tests, all passing on VS Code 1.141.0 in an unfocused window.
  - Run with `hidden-merge-rebinding.vscode-test.proto.mjs.txt`, built with `readiness-gates.build-proto.mjs.txt`.
  - To run it, copy it to `test/proto-hidden-merge/hidden-merge.test.ts`, then `node build-proto.tmp.mjs test/proto-hidden-merge/hidden-merge.test.ts dist/test/proto-hidden-merge/hidden-merge.test.js && npx vscode-test --config .vscode-test.proto-hm.mjs`.
  - What it proves:
    - a hidden merged editor rebinds;
    - a moved editor rebinds, through both `moveActiveEditor` and `joinTwoGroups`;
    - four terminals with identical display names never misbind (0 mismatches against ground truth);
    - no Terminal is recreated: `onDidOpenTerminal` and `onDidCloseTerminal` both count 0 during the operations, and every original `Terminal` is still in `window.terminals`.
- **Manager patch** (`hidden-merge-rebinding.manager-patch.diff.txt`, applied temporarily, now reverted):
  - Adds the pairing in `reconcileTabBindings`, and the reveal by Tab in `focusPane` when the Tab is not active.
  - With the patch:
    - the regression passes (1/1);
    - both p6A and p6B are paired through the merge, and again through the moves to columns 3 and 4;
    - the full `extension` label passes 87/87;
    - the two unbinds that remain are genuine Pane closes (C10, C6).
  - With pairing only, and `focusPane` still using `Terminal.show()`, the regression fails with "projection reports no errors".
- **Not tested:**
  - twin Panes through the real manager (only through the raw binder);
  - a move to the Panel, or to another window;
  - the `show(true)` reveal without focus for an orphan already in place;
  - closing an orphan Pane through the manager.
- **Cleanup:** the manager is reverted (`git checkout`), all temporary test, config and build files are removed, and `dist` is rebuilt. Apart from the other worker's files, the only changes are the `research/hidden-merge-rebinding.*` files.

<!-- end of reply -->
