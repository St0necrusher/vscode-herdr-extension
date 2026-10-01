# Issue #17 — Create server-owned Spaces and Panes

Status: **approved 2026-10-01; implemented, awaiting human review.** Requirements: [#17](https://github.com/St0necrusher/vscode-herdr-extension/issues/17) (revised 2026-10-01). Architecture authority: [`code-architecture.md`](../../architecture/code-architecture.md).

## Scope

In: New Space (Spaces View title), New Pane (Panes View title), Split Right/Down (Pane row context menu), opening the created Pane, greyed actions when stale/incompatible/no Selected Space, error notifications.

Out: native VS Code split on Pane Editors (#41), terminal profile (#39), layout projection (#19), rename/close (#18).

## Herdr facts (protocol 22, `herdr api schema --json`)

| Request | Params we send | Result |
| --- | --- | --- |
| `workspace.create` | `cwd`, `focus: false` | `workspace_created {workspace, tab, root_pane}` |
| `tab.create` | `workspace_id`, `focus: false` | `tab_created {tab, root_pane}` |
| `pane.split` | `target_pane_id`, `direction: right\|down`, `focus: false` | `pane_info {pane}` |

`focus` defaults to `false` in all three; we still pass it explicitly. Omitted `cwd` on `tab.create`/`pane.split` uses Herdr's default.

## Modules and responsibilities

```text
extension/HerdrExtension ── wires ──┐
                                    ▼
features/sessions (SessionsFeature) ── implements ──► capabilities/sessions: ActiveSessionCreation
        │ owns active HerdrSessionConnection            ▲
        ▼                                               │ consumes
infrastructure/herdr/socket (JsonSocketHerdrSessionConnection)
        create requests + reconcile-before-resolve      │
                                                        │
features/navigation ─────────────────────────────────────┘
   ├─ spaces/SpacesFeature   New Space command → createSpace → selectSpace → open root Pane
   ├─ panes/PanesFeature     New Pane / Split commands → create → open; implements NavigationPaneOpening
   └─ capabilities           + NavigationPaneOpening (Panes → Spaces sibling contract)
```

- **Sessions** owns the active connection and freshness, so it owns *whether a mutation may be sent* and to which Session. It does not decide folders, selection, or opening.
- **Herdr socket infrastructure** owns the requests, result decoding, and the guarantee that a resolved creation is already in the published projection.
- **Navigation** owns the user workflows: folder choice (View), selection after New Space, opening the result, error copy, and enablement of its actions.

## Domain model

No new domain concepts. Uses Space, Herdr Tab, Pane, Selected Space, Pane Editor, Stale. Creation results are ids only (`spaceId`, `paneId`); everything else is read from the projection.

## Public seams

```ts
// capabilities/sessions — new
export type SplitDirection = "right" | "down";
export interface ActiveSessionCreation {
  createSpace(request: { sessionId: string; cwd: string }): Promise<{ spaceId: string; paneId: string }>;
  createPane(request: { sessionId: string; spaceId: string }): Promise<{ paneId: string }>;
  splitPane(request: { sessionId: string; paneId: string; direction: SplitDirection }): Promise<{ paneId: string }>;
}
```

Contract:
- Rejects without sending when `sessionId` is not the active Session or the projection is not `connected`.
- Resolves only after the active projection that includes the created resource has been published.
- Herdr request errors reject without closing the connection. A reconciliation failure after the request follows the existing connection-failure path (projection goes stale) and rejects.

```ts
// capabilities/sessions/connection.ts — HerdrSessionConnection gains the same three operations (without sessionId).
// features/navigation/capabilities — new sibling contract
export interface NavigationPaneOpening { openPane(paneId: string): void; } // throws if the editor cannot be opened
```

`openPane(paneId)` resolves the Pane in the current Session snapshot (not only the Selected Space rows), so a creation still opens when the user changes Space mid-flight. The existing `herdr.openPane` command keeps its current behavior.

## Data flow

**New Pane (primary).**
1. User clicks New Pane (enabled only when `herdr.paneCreationEnabled`).
2. `PanesFeature` reads its model: `connected` + Selected Space → `creation.createPane({sessionId, spaceId})`.
3. `SessionsFeature` checks active Session/freshness → `connection.createPane(spaceId)`.
4. Connection sends `tab.create {workspace_id, focus:false}` → parses `root_pane.pane_id` → marks `dirty` and awaits reconciliation until a snapshot requested after the response is published (`dirty` consumed) → resolves `{paneId}`.
5. `PanesFeature.openPane(paneId)` → `PaneTerminalOpening.openPane(...)` → Pane Editor opens (observer → attach on focus as today).

**New Space.** `SpacesFeature` → `view.chooseSpaceFolder()` (single folder: returns it; multi-root: built-in `showWorkspaceFolderPick`; none: shows error, returns undefined) → `creation.createSpace({sessionId, cwd})` → `selectSpace(spaceId)` → `paneOpening.openPane(paneId)`.

**Split.** Row context action → `creation.splitPane({sessionId, paneId, direction})` → `openPane(newPaneId)`.

**Failures.** Creation rejection → error notification "Could not create …". `openPane` throws after successful creation → error notification "Pane was created but could not be opened"; no rollback.

**Enablement.** Views set context keys from their models: `herdr.spaceCreationEnabled` (Spaces state `connected`), `herdr.paneCreationEnabled` (Panes state `connected`). Manifest uses them as `enablement` for New Space / New Pane / Split.

## Expected file structure

```text
src/capabilities/sessions/
  creation.ts                  NEW  ActiveSessionCreation, SplitDirection
  connection.ts                CHG  HerdrSessionConnection + create/split operations
  index.ts                     CHG  exports
src/infrastructure/herdr/socket/
  JsonSocketHerdrSessionConnection.ts   CHG  three requests, reconcile-before-resolve
  protocol/HerdrProtocol.ts             CHG  result parsing for workspace_created / tab_created / pane_info
src/features/sessions/
  SessionsFeature.ts           CHG  implements ActiveSessionCreation
  SessionsModel.ts             CHG  active-connection + freshness guard, delegates
src/features/navigation/
  NavigationFeature.ts         CHG  passes creation + pane opening to children
  capabilities/index.ts        CHG  NavigationPaneOpening
  spaces/SpacesFeature.ts      CHG  herdr.createSpace command
  spaces/view/VsCodeSpacesView.ts  CHG  chooseSpaceFolder, error copy, context key
  panes/PanesFeature.ts        CHG  herdr.createPane / splitPaneRight / splitPaneDown; openPane(paneId)
  panes/view/VsCodePanesView.ts    CHG  error copy, context key, row contextValue
src/extension/HerdrExtension.ts  CHG  wires sessions as ActiveSessionCreation
package.json                   CHG  commands, view/title + view/item/context menus, enablement
```

## Verification plan (preliminary)

Critical now:
1. **Socket adapter integration** (`test/integration/herdr-socket`): each request sends the documented params incl. `focus:false`; resolves ids only after a snapshot containing them was delivered to the consumer; a Herdr error rejects and the connection stays open.
2. **Sessions guard** (SessionsModel behavioral): creation rejected without a request when stale, incompatible, or for a non-active `sessionId`; delegated when connected.
3. **New Space flow** (extension test, fake capabilities like `pane-command.test.ts`): single folder → `createSpace` with that cwd, Space selected, root Pane opened; multi-root cancel → no request; no folder → no request.
4. **New Pane / Split flow** (extension test): correct request, created Pane opened; open failure → error shown, no further server call.

Optional: enablement context keys follow stale/no-space transitions.

Excluded: VS Code QuickPick/notification rendering, Herdr's own cwd defaults, manifest menu wiring beyond enablement.

## Decisions (accepted 2026-10-01)

- **D1** Mutations go over the Sessions-owned socket connection, not the CLI. The results are typed, the active Session and its freshness are checked by a single owner, and D2 can be implemented inside the connection.
- **D2** A creation resolves only after the projection that includes its result has been published.
- **D3** `NavigationPaneOpening.openPane(paneId)` resolves the Pane against the whole Session snapshot.
- **D4** Enablement uses the context keys `herdr.spaceCreationEnabled` and `herdr.paneCreationEnabled`. Split uses the second.
- The verification plan is preliminary. Tests will be discussed separately after implementation.

## Open questions

- None.

## Accepted deviations (2026-10-01, after review)

- The multi-root folder choice uses VS Code's `showWorkspaceFolderPick`. The active-editor-first ordering was dropped to keep the code simpler.
- D2 is implemented with the existing `dirty` flag rather than snapshot sequence counters. The created Pane is not required to still exist in that snapshot; if it is gone, opening reports the normal error.
- View context keys are not reset on dispose. The only effect is a stale enabled button between an extension-host restart and reactivation.
