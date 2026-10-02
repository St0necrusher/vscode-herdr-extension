# Slice A: socket requests and Sessions management

Read `common.md` in this folder first.

## You own

- `src/infrastructure/herdr/socket/JsonSocketHerdrSessionConnection.ts`
- `src/infrastructure/herdr/socket/protocol/HerdrProtocol.ts` (only if needed)
- `src/features/sessions/SessionsModel.ts`
- `src/features/sessions/SessionsFeature.ts`

Report any needed change elsewhere instead of making it.

## Tasks

1. **Socket.** Replace the six `Not implemented` stubs in `JsonSocketHerdrSessionConnection` with real requests, sent through `requestOnce`, exactly like `createSpace`/`createPane`/`splitPane`:
   - `pane.rename` `{ pane_id, label }` where `label` may be `null` (send `null`, do not omit it);
   - `tab.rename` `{ tab_id, label }`;
   - `workspace.rename` `{ workspace_id, label }`;
   - `pane.close` `{ pane_id }`;
   - `tab.close` `{ tab_id }`;
   - `workspace.close` `{ workspace_id, close_group }` (always send the boolean).

   Each result is `{ "type": "ok" }`: check it with the existing `requireResultType(result, "ok")`. Then await the published snapshot, as creation does. Rename `publishSnapshotAfterCreation` to a name that covers every mutation (for example `publishSnapshotAfterMutation`). Extend the `requestOnce` method union. A Herdr error response must reject with Herdr's message and leave the connection open, which is what `requestOnce` already does for creation; verify it rather than adding handling.
2. **Sessions guard.** `SessionsModel` gains the six operations with `ActiveSessionManagement` request shapes, routed through the same guard as creation. Rename `creationConnection` to a name that covers both (for example `activeConnection`). Empty-label policy is not yours: pass labels through unchanged.
3. **SessionsFeature** implements `ActiveSessionManagement` by delegating to the model, like `ActiveSessionCreation`.

## Done when

The six operations send the documented params, resolve after the reconciled snapshot is published, and reject without sending when the Session is not the active connected one. Typecheck is clean in your files.
