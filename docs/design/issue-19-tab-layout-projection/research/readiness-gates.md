# Readiness gates for the whole-grid Tab projection (#19)

## Summary

- **Gate 1, selection isolation: PASS. No extra primitive is needed.** Revealing the Pane Editor clears the group's multi-selection, leaving only the terminal selected. This holds whether or not the Pane was already active within that selection. `moveActiveEditor` then moves only the Pane, and the file stays where it was. This was proven with a real multi-selection, made by a cmd-click on the tab through CDP, for all of these reveals: `manager.focusPane`, `surface.reveal()`, `Terminal.show()` and `Terminal.show(true)`. It held for case (a), file active, and case (b), Pane active. The result was 6/6, plus 30/30 runs with no wait between the reveal and the move.
  - Controls without a reveal show the collateral move happening. The file moves too, and because group 1 is left empty, it is removed.
  - Source: the reveal reaches `EditorGroupModel.openEditor`, which calls `setSelection(editor, options.inactiveSelection ?? [])`. The terminal reveal passes no `inactiveSelection`, so the selection resets to the Pane alone.
  - An inactive group never holds a multi-selection (`editorGroupView.ts:966-972`), so activating the group with `focus{Nth}EditorGroup` cannot bring one back.
- **Gate 2, manager identity: identity holds, lifecycle continuity fails.**
  - Through the real `PaneTerminalSurfaceManager`, and through the real extension using `herdr.openPane` with two Panes that share one display name:
    - the surface and `Terminal` stay the same, and no new terminal is created;
    - there is no pty `close` and no `onDidCloseTerminal`;
    - there are never two concurrent clients for one Pane;
    - the binding ends up on the correct moved tab, and focus, presence and the Visible marks are all correct afterwards.
  - **But** every cross-group change (the surplus merge, and the move) briefly **unbinds** the Pane. The manager deselects it, which stops its client and starts a new one. The title flickers to the synthetic `session:pane` name, and the Visible presence drops for a moment. In the manager harness, the moved Pane's Attach was dropped and recreated once per operation (3 Attach starts for p2), and a Pane that was not moved had 0.
- **Root cause**, in `PaneTerminalSurfaceManager.reconcileTabBindings` (`:183-198`):
  - VS Code gives an editor that changes group a **new** `vscode.Tab` object (`TAB_OPEN` in the target, then `TAB_CLOSE` in the source).
  - The fallback binding matches `tab.label === terminalName` (the synthetic name), but the surface has already renamed the tab to the Pane name (`PaneTerminalSurface.ts:191-199,252-265`).
  - The binding therefore fails, so the manager deselects the Pane and calls `hidePaneName()`. The synthetic name comes back, the tab rebinds, and `showPaneName()` runs.
  - Twin names cannot misbind, because the recovery relies on the unique synthetic name. The cost is a client restart per moved Pane.
- **Proposed minimal fix (owner: `PaneTerminalSurfaceManager`, not implemented).**
  - When a bound tab disappears, first look for exactly one candidate tab that is all of these:
    - a `TabInputTerminal`;
    - new since the previous reconcile;
    - not bound to another surface;
    - labelled with the surface's currently published name.
  - If there is exactly one, rebind silently: no deselect, no `hidePaneName`.
  - Otherwise fall back to today's synthetic-name round trip.
  - This needs the surface to expose its published label, and the manager to keep the set of tabs it saw at the last reconcile.
- **Open questions:**
  1. Is a client restart plus a title flicker per moved Pane acceptable, rather than adopting the fix? It drops a live Attach and resets the screen (ADR 0012).
  2. The fix stays unambiguous only while one moved twin appears per tab event. Source shows that a merge moves editors one at a time (`moveEditors` loops over `moveEditor`, and each one opens before it closes), but no test proved this for two twins inside one merged group.

## Method

- **VS Code version:** 1.141.0 (`.vscode-test`), with `window.state.focused=false`.
- **Source references:** VS Code sources fetched at tag `1.141.0` (via `gh api`).
- **Manager harness** (`readiness-gates.proto.test.ts.txt`):
  - It reuses the `test/extension/pane-editors.test.ts` pattern: real `PaneTerminalSurfaceManager`, `VsCodePaneTerminalSurface`, `PaneEditorSelectionModel` and `PaneEditorFocusTracker`; fake `PaneClientFactory` (it records every client and the maximum concurrent per terminal); fake focused window; fake projection.
  - It reads the manager's private `surfacesBySession[..].tab`, which is acceptable in a prototype, to compare the binding with the live tab.
- **Real-extension harness** (`readiness-gates.real-extension.proto.test.ts.txt`):
  - It runs the activated extension in `test/fixtures/composition-workspace`, with the composition fake Herdr CLI (`dist/test/extension-composition/fakeHerdrCli.js`).
  - The fake socket server is a copy of `fakeHerdrServer.ts`, changed in three ways: it serves two Panes, both labelled `Twin Pane`; it records every CLI client connection along with when it closes; and its sampler measures the maximum number of open clients per terminal.
  - Panes are opened with `herdr.openPane`. The Panes View "Visible in an editor" marks are read from the extension's own `FileDecorationProvider`, captured when it registers.
- **Multi-selection:**
  - No command or API sets the editor selection. The only setters are tab clicks in `multiEditorTabsControl.ts`.
  - The VS Code under test runs with `--remote-debugging-port`. The test connects to the renderer over CDP and dispatches a `mousedown` with `metaKey` on the tab. That goes through `handleClickOrTouch` → `selectEditor` → `groupView.setSelection(editor, selectedEditors)`.
  - The test reads the selection back from the DOM (`.tab.multi-selected`).
- **Run instructions:**
  1. Copy the `.txt` files back to these locations: `test/proto-gates/gates.test.ts`, `test/proto-gates-composition/composition-gates.test.ts`, `.vscode-test.proto-gates.mjs` and `build-proto.tmp.mjs`.
  2. Run `node esbuild.mjs`. This builds the extension and the fake CLI, and generates the composition workspace settings.
  3. Run `node build-proto.tmp.mjs <entry.ts> <dist/test/...js>` for each prototype.
  4. Run `npx vscode-test --config .vscode-test.proto-gates.mjs`.
- **Result:** 17 + 1 passing. The trimmed log is in `readiness-gates.run.log.txt`. All temporary repo files were removed, and `git status` is unchanged apart from these research files.

## Gate 1 details

**Setup.** There are two groups: `[F1.txt, Pane P] | [G2.txt]`. The Pane is bound and renamed. A real two-editor multi-selection is made in group 1, which is active:

- **(a)** P is active, then F1 is cmd-clicked. F1 becomes active and P stays selected (`multi=["F1","Pane P"]`, `active="F1.txt"`).
- **(b)** F1 is active, then P is cmd-clicked. P becomes active and F1 stays selected (`active="Pane P"`).

Each case then runs a reveal variant followed by `moveActiveEditor { to: "position", by: "group", value: 2 }`.

| Case | Reveal | Multi-selection after reveal | Result |
|---|---|---|---|
| a | none (control) | `[F1, Pane P]` | `[[G2, F1, Pane P]]`: both moved, and group 1 was removed |
| a | `manager.focusPane` (focusNth + `surface.reveal` = `Terminal.show()`) | `[]` | `[[F1],[G2, Pane P]]` |
| a | `Terminal.show(true)` | `[]` | `[[F1],[G2, Pane P]]` |
| a | `Terminal.show(false)` | `[]` | `[[F1],[G2, Pane P]]` |
| b | none (control) | `[F1, Pane P]` | `[[G2, Pane P, F1]]`: both moved |
| b | `manager.focusPane` | `[]` | `[[F1],[G2, Pane P]]` |
| b | `Terminal.show(true)` | `[]` | `[[F1],[G2, Pane P]]` |
| b | `Terminal.show(false)` | `[]` | `[[F1],[G2, Pane P]]` |
| c | multi-selection, then focus group 2, then focus group 1, then `focusPane` | `[]` | `[[F1],[G2, Pane P]]` |
| a, b | `show(true)`, `show()` or `surface.reveal()`, then **immediately** `moveActiveEditor` (×5 each) | — | 30/30 `[[F1],[G2, Pane P]]` |

**Source chain (VS Code 1.141.0).**

1. `Terminal.show(p)` → `MainThreadTerminalService.$show` (`mainThreadTerminalService.ts:189-196`): `setActiveInstance`, then `terminalEditorService.revealActiveEditor(preserveFocus)`.
2. `_revealEditor` (`terminalEditorService.ts:265-285`): `editorService.openEditor(input, { pinned, forceReload, preserveFocus, activation: PRESERVE })`. It passes no `inactiveSelection`.
3. `EditorService.openEditor` (`editorService.ts:540-585`): for a typed `EditorInput` there is no await before `findGroup` resolves the group.
4. `EditorGroupView.doOpenEditor` passes `inactiveSelection: internalOptions?.inactiveSelection`, which is undefined (`editorGroupView.ts:~1214`).
5. `EditorGroupModel.openEditor`:
   - an existing editor runs `this.setSelection(makeActive ? existingEditor : this.activeEditor, options?.inactiveSelection ?? [])` (`editorGroupModel.ts:418`);
   - a new editor runs the same at `:397`.
   - The result is selection = [Pane].
6. The move acts only on `activeGroup.selectedEditors` (`editorCommands.ts:235-244`, `moveCopyEditorsToGroup` `:342-355`).
7. A group that becomes inactive clears its multi-selection: `setActive(false)` → `setSelection(activeEditor, [])` (`editorGroupView.ts:966-972`). This is case (c).

**How to use it in the projection.**

1. Activate the Pane's group with `focus{Nth}EditorGroup`, or Eighth + Next hops.
2. Reveal the Pane through the surface: `surface.reveal()` / `Terminal.show()`, or the manager's `focusPane`.
3. Run `moveActiveEditor`.

Notes on this sequence:

- No wait on selection is needed. No API exposes the selection anyway, and checking `activeTab` alone is indeed insufficient, as the architect said.
- The ordering is safe empirically (30/30 runs). In source, nothing awaits between `$show` and the model's `setSelection` for a typed input, and the RPC messages arrive in order.
- One caveat: the `Terminal.show` → `revealActiveEditor` chain resolves the group itself, through `findGroup`. That is why the Pane's group must be the active group before the reveal, which the planned sequence already does.

## Gate 2 details

### Manager harness

**Setup.** Two Panes, run once with the titles `"Twin name"`/`"Twin name"` and once with `"Alpha one"`/`"Beta two"`. Both runs gave identical results.

1. Layout `[F1, P1] | [F2] | [P2]`. Both Panes are bound and renamed, with one Attach each.
2. Surplus merge: group 3 is active (it holds P2), and `vscode.setEditorLayout` reshapes to 2 groups, which gives `[F1, P1] | [F2, P2]`.
3. `manager.focusPane(P2)`, then `moveActiveEditor` to group 1, which gives `[F1, P1, P2] | [F2]`.
4. `focusPane(P2)` again, then `openPane(P2)` and `openPane(P1)`.

**Pass.** Surfaces created: 2. Terminals created during the operations: 0. Both `Terminal` objects are the same. pty `close`: none. `onDidCloseTerminal`: 0. Maximum concurrent clients per terminal: 1.

After the merge and after the move, the manager's `tab` for P2 is the live tab object in the expected group (2, then 1). `focusPane(P2)` focuses group 1 with P2 active. Presence is `focused = p2`.

**Fail (continuity).** The tab-event timeline for both the merge and the move was:

```
[[F1,"Twin name"],[F2,"Twin name"],["Twin name"]]   # TAB_OPEN in target (old tab still present)
...                                                # TAB_CLOSE in source -> bound tab gone, label != synthetic -> unbind
[[F1,"Twin name"],[F2,"gates-10:p2"]]               # hidePaneName(): synthetic name published
[[F1,"Twin name"],[F2,"Twin name"]]                 # rebound by synthetic name -> showPaneName()
```

During the merge, the presence log went `{visible:[p1,p2]}`, then `{visible:[p1]}` (P2 deselected), then `{visible:[p1,p2], focused:p2}`. P2's client history was `attach stopped`, `attach stopped`, `attach stopped`: one new Attach per operation. P1 was never moved and was never restarted.

### Real extension

The Panes `pane-a` and `pane-b` are both labelled `Twin Pane`, and the steps are the same as in the manager harness. The window is unfocused, so the clients are Observers.

- **After the merge:**
  - `[[F1, Twin Pane],[F2, Twin Pane]]`;
  - the same 2 terminals;
  - Visible marks a and b are both true;
  - `onDidCloseTerminal` was 0;
  - the tab events included `composition:pane-b`, which is the same flicker.
- **After the move:**
  - `[[F1, Twin Pane, Twin Pane],[F2]]`;
  - Visible a=false (now behind b) and b=true;
  - the same terminals.
- **`herdr.openPane pane-b`:** no new terminal. It reveals b in group 1. Being `Terminal.show`, it activates the editor inside its group without changing the active group.
- **Clients:** the maximum number of open clients per terminal at any time was 1. Observers also restart on resize, so the real-extension client counts mix the two causes. The manager harness, which uses Attach and resizes in place, isolates the identity-caused restart.

### Root cause, by owner

- **VS Code:**
  - A cross-group move is close + open in the editor model. `MainThreadEditorTabs` turns it into `TAB_OPEN` then `TAB_CLOSE` (`mainThreadEditorTabs.ts:291-367,564-571`).
  - `ExtHostEditorTabs` creates a new `ExtHostEditorTab` on `TAB_OPEN` (`extHostEditorTabs.ts:197-214`).
  - Tab objects are therefore not stable across groups. `TabInputTerminal` carries no terminal reference.
- **`PaneTerminalSurfaceManager.reconcileTabBindings`** (`src/modules/pane-editors/PaneTerminalSurfaceManager.ts:183-198`):
  - It rebinds only by `tab.label === managed.terminalName`.
  - After the first bind, `showPaneName()` has replaced the label with the Pane name (`PaneTerminalSurface.ts:191-199,252-265`).
  - So for the event that removes the old tab, `managed.tab` is `undefined` and `wasBound` is true. The manager then calls `selection.deselect` and `hidePaneName()`.
  - `deselect` reaches `PaneEditorFocusTracker`, which publishes `editor-hidden` synchronously. The surface's `converge()` releases the client. The rebind then starts a new one.
  - The existing test C8 already records the flicker: "Rebinding briefly publishes the terminal name before the Pane title returns."

### Proposed minimal fix (not implemented)

At the owner, `PaneTerminalSurfaceManager.reconcileTabBindings`:

1. Keep `previousTabs: Set<vscode.Tab>`, the tabs seen at the last reconcile.
2. When `managed.tab` is no longer present:
   - first try the candidates: tabs not in `previousTabs`, with `input instanceof TabInputTerminal`, not bound by another surface, and whose `label` equals the surface's current published label;
   - if there is exactly one, assign it and keep the selection and the name as they are;
   - otherwise keep today's path: the synthetic name round trip, and deselecting only when nothing matches.
3. `PaneTerminalSurface` exposes its current published label read-only. That is the name with no-break spaces, or `terminalName` while the Pane name is hidden.

What this keeps:

- Twins stay safe. The other twin's tab is not new, and a merge moves editors one at a time, so each `TAB_CLOSE` sees exactly one new candidate. This was observed for single moves. The case of two twins in one merged group is inferred from `editorGroupView.ts:1388-1416`.
- Recreating or duplicating a terminal is never used as a recovery.
- A different-label or ambiguous case degrades to today's behaviour.

Add a regression test next to C8 that asserts no client restart and no label flicker across `moveActiveEditor` and a `setEditorLayout` merge.

<!-- end of reply -->
