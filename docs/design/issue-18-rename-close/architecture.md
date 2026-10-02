# Issue #18 — Rename and close Panes, Tabs, and Spaces

Status: **approved 2026-10-01; implementation in progress.** Requirements: [#18](https://github.com/St0necrusher/vscode-herdr-extension/issues/18) (revised 2026-10-01). Decisions: [ADR 0005](../../adr/0005-never-close-last-tab-or-pane-of-a-space.md), [ADR 0006](../../adr/0006-close-actions-close-their-pane-editors.md), [ADR 0007](../../adr/0007-worktree-group-close-mirrors-herdr.md). Architecture authority: [`code-architecture.md`](../../architecture/code-architecture.md). Follows the #17 pattern: [`../issue-17-create-spaces-panes/architecture.md`](../issue-17-create-spaces-panes/architecture.md).

## Herdr facts (protocol 22, `herdr api schema --json`; herdr source)

| Request | Params we send | Notes |
| --- | --- | --- |
| `pane.rename` | `pane_id`, `label: string \| null` | `null` clears the label |
| `tab.rename` | `tab_id`, `label` | label required |
| `workspace.rename` | `workspace_id`, `label` | label required |
| `pane.close` | `pane_id` | cascades to Tab/Space; we never send the last one (ADR 0005) |
| `tab.close` | `tab_id` | cascades to Space; we never send the last one |
| `workspace.close` | `workspace_id`, `close_group` | without `close_group`, a group primary is refused with `workspace_group_close_required` |

Closes return `ok`; renames return the updated record (`pane_info`, `tab_info`, `workspace_info`). Corrected 2026-10-02: the original draft said all six return `ok`, which made every rename report an error after succeeding. Worktree Group rule (Herdr `client/shell/sidebar.rs::workspace_close_is_group`): a Space whose `worktree` exists and `is_linked_worktree` is false, and at least one other Space has the same `repo_key` (our `repositoryKey`) with `is_linked_worktree` true; if another same-key Space is not linked, it is not a group. Members: the primary plus those linked same-key Spaces. Assumption: Herdr's client `worktree.key` is the API `repo_key` (the only key the API exposes).

## Modules and responsibilities

```text
features/sessions (SessionsFeature/Model) ── implements ──► capabilities/sessions: ActiveSessionCreation (existing)
        │ active connection + freshness guard                                     ActiveSessionManagement (NEW)
        ▼
infrastructure/herdr/socket (JsonSocketHerdrSessionConnection)
        six new requests, reconcile-before-resolve (D2 of #17)

infrastructure/pane-editors (PaneTerminalSurfaceManager) ── implements ──► capabilities/terminalSurfaces: PaneTerminalClosing (NEW)

features/navigation
   ├─ panes/PanesModel    + closability (Pane: Space has >1 Pane; Tab: Space has >1 Tab)
   ├─ panes/PanesFeature  Rename Pane / Rename Tab / Close Pane / Close Tab commands
   ├─ spaces/SpacesModel  + Worktree Group detection per entry
   └─ spaces/SpacesFeature Rename Space / Close Space / Close Group commands
```

- **Sessions** decides whether a mutation may be sent and to which Session (same guard as creation).
- **Socket infrastructure** owns the requests and resolves only after the snapshot that reflects them is published.
- **Pane editors** owns closing Pane Editors for given Panes; it knows nothing about why.
- **Navigation** owns the workflows: which actions a row offers, input boxes, the Close Space modal, which Panes an action closes, error copy.

## Domain model

New concept: **Worktree Group** (`CONTEXT.md`), derived in `SpacesModel` from the snapshot; not stored. Closability is a derived property of rows. Everything else uses existing terms (Space, Herdr Tab, Pane, Pane Editor, Stale, Selected Space). No new state owners.

## Public seams

```ts
// capabilities/sessions/management.ts — NEW
export interface ActiveSessionManagement {
  renamePane(request: { sessionId: string; paneId: string; label: string | null }): Promise<void>;
  renameTab(request: { sessionId: string; tabId: string; label: string }): Promise<void>;
  renameSpace(request: { sessionId: string; spaceId: string; label: string }): Promise<void>;
  closePane(request: { sessionId: string; paneId: string }): Promise<void>;
  closeTab(request: { sessionId: string; tabId: string }): Promise<void>;
  closeSpace(request: { sessionId: string; spaceId: string; closeGroup: boolean }): Promise<void>;
}
// HerdrSessionConnection gains the same six operations without sessionId.

// capabilities/terminalSurfaces/paneTerminalClosing.ts — NEW
export interface PaneTerminalClosing {
  closePanes(sessionId: string, paneIds: readonly string[]): void; // closes only open Pane Editors of these Panes
}
```

Contract (same as `ActiveSessionCreation`): rejects without sending when the Session is not the active connected one; resolves after the reconciled snapshot is published; a Herdr error rejects with Herdr's message and leaves the connection open.

## Data flow

**Close Tab (primary).**
1. User clicks `×` on a group row (shown only when the Space has >1 Tab, `herdr.paneActionsEnabled`, and `herdr.views.showInlineClose`).
2. `PanesFeature` reads the row's Tab and its Pane ids from the current state, then `management.closeTab({sessionId, tabId})`.
3. Sessions guard → connection sends `tab.close` → awaits reconciliation → resolves.
4. `PanesFeature` → `paneClosing.closePanes(sessionId, paneIds)` → manager disposes those surfaces (same path as a user closing the editor: remove, deselect, dispose).
5. Tree already shows the Tab gone (step 3 published the snapshot).

**Close Pane.** Same, with one Pane id.

**Close Space / Close Group.** `SpacesFeature` → `view.confirmSpaceClose(entry)` modal (group: title "Close Group", lists member Space labels) → cancel: nothing → `management.closeSpace({sessionId, spaceId, closeGroup})` → `closePanes(sessionId, panes of the Space or of all group members)`. If the Selected Space closed, existing selection fallback (focused, else first) applies.

**Rename.** Feature → View input box (prefilled: Pane with its own label, empty when it has none; Tab/Space with their label; Tab/Space reject empty) → cancel: nothing → `management.rename…` (Pane: empty → `null`). Pane Editor titles follow the snapshot as today.

**Failures.** Any rejection → error notification "Could not close/rename …: <message>". No retry, no reconciliation, no editor closed. `workspace_group_close_required` (snapshot race) is just such an error.

**Enablement and menus.**
- Context keys: rename `herdr.paneCreationEnabled` → `herdr.paneActionsEnabled`, `herdr.spaceCreationEnabled` → `herdr.spaceActionsEnabled` (each = its view's state is `connected`). All new commands use them as `enablement`.
- Row `contextValue` encodes kind and closability, e.g. `herdr.panes.pane`, `herdr.panes.pane.closable`, `herdr.panes.singleton(.closable)`, `herdr.panes.group(.closable)`, `herdr.space(.selected)(.group)`; menus match with regex.
- Inline `×` (`view/item/context`, group `inline`) is additionally gated by `config.herdr.views.showInlineClose` (new boolean setting, default `true`). Close Space and Close Group are separate commands so the label differs.
- Every new command is hidden from the Command Palette (`"when": "false"`).

## Expected file structure

```text
src/capabilities/sessions/
  management.ts                NEW  ActiveSessionManagement + request types
  connection.ts                CHG  HerdrSessionConnection + six operations
  index.ts                     CHG  exports
src/capabilities/terminalSurfaces/
  paneTerminalClosing.ts       NEW  PaneTerminalClosing
  index.ts                     CHG  export
src/infrastructure/herdr/socket/
  JsonSocketHerdrSessionConnection.ts   CHG  six requests via requestOnce + publishSnapshotAfterCreation (renamed for mutations)
  protocol/HerdrProtocol.ts             CHG  only if an `ok` result parser is needed
src/infrastructure/pane-editors/
  PaneTerminalSurfaceManager.ts         CHG  implements PaneTerminalClosing
src/features/sessions/
  SessionsModel.ts / SessionsFeature.ts CHG  implement ActiveSessionManagement with the existing guard
src/features/navigation/
  NavigationFeature.ts         CHG  passes management + paneClosing
  panes/PanesModel.ts          CHG  closability on rows/groups
  panes/PanesFeature.ts        CHG  four commands
  panes/view/VsCodePanesView.ts  CHG  contextValues, input box, error copy, context key rename
  spaces/SpacesModel.ts        CHG  Worktree Group on entries
  spaces/SpacesFeature.ts      CHG  three commands
  spaces/view/VsCodeSpacesView.ts  CHG  contextValues, input box, modal, error copy, context key rename
src/extension/HerdrExtension.ts  CHG  wiring
package.json                   CHG  commands, menus (inline + context), palette hiding, setting, key renames
```

## Verification plan (preliminary)

Critical now:
1. **Socket adapter integration** (extend `JsonSocketHerdrSessionConnection.test.ts`): each request sends the documented params (incl. `label: null`, `close_group` true/false); resolves after the snapshot is delivered; Herdr error rejects, connection stays open.
2. **Sessions guard** (`SessionsModel.test.ts`): a management call when stale or for a non-active Session rejects without a request.
3. **PanesModel** (behavioral): Pane closable iff Space has >1 Pane; Tab closable iff Space has >1 Tab — covers ADR 0005.
4. **SpacesModel** (behavioral): Worktree Group detection — primary with linked child is a group with members; linked child alone, plain Space, and two unlinked same-key Spaces are not.
5. **Close flows** (extension test like `creation-commands.test.ts`): Close Pane / Tab / Space / Group send the right request and close exactly the affected Panes' editors; modal cancel sends nothing; a rejected close shows an error and closes no editor.
6. **Rename flows** (extension test): empty Pane name sends `null`; cancel sends nothing.

Optional: `PaneTerminalSurfaceManager.closePanes` leaves other Sessions'/Panes' editors open (unit); context keys follow stale; manifest `when` clauses.

Excluded: VS Code InputBox/modal rendering, Herdr cascade and group semantics, menu layout.

## Decisions

- **D1** New capability `ActiveSessionManagement` beside `ActiveSessionCreation` rather than widening it: different verbs, same guard and connection path.
- **D2** Mutations resolve after the reconciled snapshot is published (reuse of #17 D2), so editors close after the tree already reflects the close.
- **D3** The Panes affected by a close are computed by Navigation from the snapshot at click time and passed to `PaneTerminalClosing`; the surface manager does not infer closes from snapshots (ADR 0006).
- **D4** Two context keys, one per view (`herdr.paneActionsEnabled`, `herdr.spaceActionsEnabled`), replacing the creation keys. Clarifies the grilling answer "one key": one key per view, covering creation, rename, and close.

## Accepted implementation decisions

- **Rename Pane prefill** (user, 2026-10-01): the input box holds the Pane's own `label`, or is empty when it has none, rather than the displayed terminal title, so accepting it unchanged never pins the title as a label.
- `PaneTerminalSurfaceManager.closePanes` reuses the existing editor-close path (remove, deselect, dispose).
- Known limitation (advisory review, 2026-10-02): Close Pane/Tab checks closability against the latest published snapshot. If another client closes a sibling within the event debounce window, Herdr may still cascade the close to the Space. Only Herdr can refuse that atomically; no client-side workaround.

## Open questions

- None.
