# Slice F: simplification for issue #17

You implement one bounded slice of approved work, using the `implement-slice` skill conventions. The user approved every change listed below.

## Context

- Branch `feat/issue-17-create-spaces-panes`. All #17 work is uncommitted in the working tree (`git diff HEAD`, plus the untracked `src/capabilities/sessions/creation.ts`). Do not commit, push or stage.
- Read `docs/design/issue-17-create-spaces-panes/architecture.md` but do not edit it. Rules: `docs/architecture/code-architecture.md`.
- Behavior must not change except where S3 says otherwise. No defensive over-engineering: no new flags, no guards against impossible states.

## Tasks

### S1. Socket: replace the sequence counters with the `dirty` flag

File: `src/infrastructure/herdr/socket/JsonSocketHerdrSessionConnection.ts`.

- Remove `snapshotRequestSequence`, `latestSnapshotRequestSequence`, their updates in `runReconciliation`, `createAndReconcile`, and `reconcileCreatedPane`.
- Each create method becomes: request, parse, then wait for a post-creation snapshot, then return the parsed ids.
- The wait is one private method with a name that says what it does, for example `publishSnapshotAfterCreation`. It does the following:
  ```ts
  this.dirty = true;
  do await this.reconcileSnapshots(); while (this.dirty && !this.disposed);
  if (this.disposed) throw new Error("Herdr Session connection is disposed.");
  ```
  On a reconciliation error, keep the current behavior: `failConnection(error, "snapshot")`, then rethrow.
- Why this is correct: `runReconciliation` clears `dirty` only right before requesting a snapshot. If `dirty` is false after the await, a snapshot requested after the creation response has been published. If `dirty` is still true, we joined a reconciliation that was already finishing, so we loop once more.

### S2. `requestOnce` without a mode flag

Same file.

- `requestOnce(method, params)` drops the optional `operation` parameter and always rethrows errors unchanged.
- The two existing callers that need connection failures wrap them at the call site with `asFailure(error, "ping")` and `asFailure(error, "snapshot")`: the ping in `bootstrap` and the snapshot in `runReconciliation`.
- Preserve the exact failure the old code produced for ping and snapshot errors. Check the `bootstrap` catch, which converts with `asFailure(error, "snapshot")` when `this.failure` is undefined: a ping error must still surface with operation `"ping"`.

### S3. Use the built-in folder picker

File: `src/features/navigation/spaces/view/VsCodeSpacesView.ts`, `chooseSpaceFolder`.

- No folders: keep the current error and return `undefined`.
- One folder: return it without a prompt.
- Several folders: `vscode.window.showWorkspaceFolderPick({ placeHolder: "Choose a folder for the new Herdr Space" })`, then return `?.uri.fsPath`.
- Drop the custom QuickPick and the active-editor ordering. This behavior change is approved.

### S4. One create-then-open helper in `PanesFeature`

File: `src/features/navigation/panes/PanesFeature.ts`.

- `createPane` and `splitPane` share one private method that runs the creation, shows the given creation error on failure, then opens the created Pane and shows `showCreatedPaneOpenError` on failure.
- `SpacesFeature` stays as it is.

### S5. Named request types

- In `src/capabilities/sessions/creation.ts`, add and export `CreateSpaceRequest`, `CreatePaneRequest` and `SplitPaneRequest`, and use them in `ActiveSessionCreation`.
- Export them from `capabilities/sessions/index.ts`.
- Replace every `Parameters<ActiveSessionCreation[...]>[0]` in `SessionsModel.ts` and `SessionsFeature.ts` with them, and add explicit return types.

## Done when

- S1–S5 are implemented with no other changes.
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` pass. Report any failure with its output.
- Do not write or modify tests.

## Report

End with a final message containing:
- the changed files;
- what you did per task;
- the check results;
- any deviation or open question.
