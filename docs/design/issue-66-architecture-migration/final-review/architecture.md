# Final architecture review of #66

Reviewer: Claude subagent of `claude-migration`, consulting the architect astra (pi, pane `w3:p4F`). Snapshot: `git diff origin/main...HEAD` at `425ada2`. Read-only: no code changed. astra's full answers: `answers/final-architecture.md` (Q1, Q2).

## Summary

The migration meets the architecture's intent in its main shape. `api/herdr` holds only Herdr mechanics. `SessionsModel`, Pane Editors and Workspace Context are modules with one owner per fact. Features own their prompts, confirmations and errors. Views own the trees, the status bar and the hover. Peer rules hold without workarounds. The capabilities/infrastructure layers and all old aliases are gone. Most of the old Navigation/Sessions facades were dissolved rather than renamed. The exceptions are below.

There is no blocking finding. astra confirmed eight findings and asked for them to be fixed in this PR:

- **Important:** a forwarding feature (A); a feature that calls back into a view (E); composition bookkeeping that tripled in size (G).
- **Minor:** dead leftover types (B); test-only public exports (C); duplicated error helpers (D); the surface registration that sits in `extension/` (F); stale names and doc status (K).

After consultation, four candidates are not defects: H, I, J and L.

## Findings

### A. `StartLocalSessionFeature` is a facade around one module call
- **Classification:** astra-confirmed. **Severity:** important.
- **Evidence:** `src/features/start-local-session/StartLocalSessionFeature.ts:4-18` registers `herdr.start`, and its `start()` only returns `operations.startSelectedSession()`. `src/views/connection-status/ConnectionStatus.ts:18-19` already receives `SessionsOperations` and the feature, and calls `startLocalSession.start()` at `:72-73`. On `origin/main`, `StatusFeature` registered `herdr.start` as `() => operations.startSelectedSession()`. This contradicts ARCHITECTURE §4 ("Not every verb is a feature") and the §5 anti-pattern "A feature folder around one module call". It also contradicts IMPLEMENTATION ("never as a facade that republishes another object's methods").
- **Fix:** delete `features/start-local-session`. `ConnectionStatus` registers `herdr.start`, calls `startSelectedSession()` directly and disposes the registration. The status action "start" uses the same call. Keep the Promise and error semantics. Move the routing and disposal checks in tests to the new owner. The extension's full command set stays unchanged.

### B. Dead types left in `modules/sessions`
- **Classification:** confirmed defect (astra agrees). **Severity:** minor.
- **Evidence:**
  - `src/modules/sessions/sessionEvents.ts:7-15`: no production code uses `HerdrSessionEventName` or `HerdrSessionEventSource`. Pane Editors declares its own source at `src/modules/pane-editors/session-source.ts:29`.
  - `HerdrSessionEventMap` has a single entry. It is used only as `HerdrSessionEventMap["pane.moved"]` (`SessionsModel.ts:54,158`), and that file already imports `HerdrPaneMovedEvent`.
  - `ActiveSessionProjectionSource` in `src/modules/sessions/activeSessionProjection.ts:25` has no production user. Only `test/extension-fresh-window/first-pane-editor-focus.test.ts:4` imports it, through a private path.
- **Fix:** use `HerdrPaneMovedEvent` in `SessionsModel` and delete `sessionEvents.ts`. Delete the unused interface. The test uses the consumer's contract or declares a local type. Keep the projection state, the mapping function and the `SessionsModel` methods (D15).

### C. Public entries export test-only symbols
- **Classification:** astra-confirmed. **Severity:** minor.
- **Evidence:** ARCHITECTURE §3 says `index.ts` exports "what other blocks need, never something for tests only". Only tests import these symbols through the entries:
  - `src/modules/workspace-context/index.ts:2` (`ActiveSessionProjectionSource`, `PaneEditorPresenceSource`)
  - `src/modules/pane-editors/index.ts:7` (`PaneEditorPresence`, kept in slice 7 explicitly for `test/extension/agents-navigation.test.ts:11`)
  - `src/api/herdr/index.ts:14,19` (`HerdrSessionProjectionConsumer`, `HerdrConnectionFailureError`)
- **Fix:** remove these re-exports. Keep the definitions, which are used inside their blocks, and point the tests at the definition files (§7 allows this).

### D. Error helpers copied into every feature file
- **Classification:** astra-confirmed. **Severity:** minor.
- **Evidence:**
  - `errorMessage()` is now defined in 12 feature files, and `showError()` in 11. Examples: `src/features/close/closePane.ts:35-41` and its three siblings, `src/features/create-pane/{createPane,splitPane}.ts` and `shared/createAndOpenPane.ts`, `src/features/rename/*`, `CreateSpaceFeature.ts:70-76`, and `RunNpmScriptFeature.ts:144`.
  - On `origin/main` there were 3 copies, one in each old view.
  - ARCHITECTURE §3 puts code used by several parts in `shared/`. §4 puts code without domain knowledge that two features need in `core/`.
- **Fix:** add one pure `errorMessage` in `core/`. Inline `void vscode.window.showErrorMessage(...)` instead of the one-line `showError` wrappers, or use a feature-local `shared/` helper. Do not add a notification service or a shared error handler. The message text and the catch stay in each scenario.

### E. `RunNpmScriptFeature` calls back into the npm-scripts view
- **Classification:** astra-confirmed. **Severity:** important.
- **Evidence:** `src/features/run-npm-script/RunNpmScriptFeature.ts:7,17,25-27` takes a structural `NpmScriptCursorSource` and calls `scriptAtCursor()` on it. `src/extension/HerdrExtension.ts:142` passes the `VsCodeNpmScriptsView` instance. On `origin/main` the feature owned the view, so the call was internal. The split turned it into a feature-to-view dependency that the structural type hides from ESLint. This goes against ARCHITECTURE §4: views create the UI that triggers a scenario (including an editor menu) and pass plain data.
- **Fix (astra's option 1):**
  - `VsCodeNpmScriptsView` registers `herdr.runNpmScriptAtCursor` as an input adapter: it reads the cursor target and passes it to a public entry of the feature. The feature still owns execution and messages.
  - The view may use the feature's public `NpmScriptTarget` type. Construct the feature before the view.
  - Keep the "No npm script at the cursor." message and the moment the cursor is read.
  - Optionally add one sentence to §4: "a view may register a command adapter that extracts surface data and passes it to a feature".
  - Do not move the `package.json` parser to `core/` for this.

### F. The decoration provider's registration lives in `extension/`
- **Classification:** astra-confirmed. **Severity:** minor.
- **Evidence:** `src/views/sidebar/shared/visiblePaneEditorDecoration.ts:19-35` owns the decoration data and subscriptions. `src/extension/HerdrExtension.ts:144-145` calls `vscode.window.registerFileDecorationProvider` and keeps two fields, `decorationProvider` and `decorations`. Every other view registers its own surface in its constructor, and `extension/` should hold only composition (§4).
- **Fix:** register inside the provider and dispose the registration in its `dispose()`. `extension/` keeps one object. Test harnesses that register manually keep one registration per instance.

### G. Composition bookkeeping in `HerdrExtension` tripled
- **Classification:** astra-confirmed (the simplification; the cleanup itself is not a defect). **Severity:** important.
- **Evidence:** `src/extension/HerdrExtension.ts:41-243` lists each of 24 objects up to five times: as a field, a `let x | undefined`, an assignment, a line in the catch ladder, and a line in `dispose()`. About 110 of the 245 lines are this bookkeeping. On `origin/main` there were 8 objects. The repetition hides the composition that `extension/` exists to show. The catch cleanup cannot simply be dropped: the registrations are externally visible, and a test covers partial-failure cleanup.
- **Fix:**
  - Keep fields only for objects needed after construction, mainly `sessions` and `takeoverPluginRegistration`. Wire everything else with local `const`.
  - Add one small local list of acquired disposables. Record each object right after it is created. The catch block and `dispose()` both release that list.
  - Do not add a DI container, a lifecycle framework or async dispose.
  - **Caveat:** today's disposal order is not exactly the reverse of construction. `takeoverPopupHost` is disposed between the surface manager and the focus tracker. Keep the current order explicitly, or justify and test a change.

### H. Default and trim rules in `extension/HerdrSettings.ts`
- **Classification:** not a defect after consultation.
- **Evidence:** `src/extension/HerdrSettings.ts:8-15`. astra: binding host input to the typed `HerdrConfiguration` (trim, defaults for blank values) is adapter detail under D6. The rule that the saved selection wins over the setting stays in Sessions. Moving the normalization would put VS Code input format knowledge into Sessions.

### I. Role interfaces with one implementation
- **Classification:** not a defect after consultation.
- **Evidence:** the role interfaces are:
  - `SessionsStateSource`, `SessionsOperations`, `ActiveSessionCreation` and `ActiveSessionManagement` on `SessionsModel`
  - `NavigationContextSource`, `SpaceSelectionOperations` and `VisiblePaneEditorsSource` on `NavigationContextModel`
  - `PaneTerminalOpening` and `PaneTerminalClosing` on `PaneTerminalSurfaceManager`

  As a result the composition passes the same object twice, for example `HerdrExtension.ts:138-139`. astra: these describe different consumer roles, not a mirror of the whole class. IMPLEMENTATION allows an interface at a real block boundary. No follow-up is needed.

### J. `paneTerminalOpenRequest` and the repeated Pane lookup
- **Classification:** not a defect after consultation.
- **Evidence:** there are five call sites of the form `paneTerminalOpenRequest(state.sessionId, pane, paneName(pane))`:
  - `CreateSpaceFeature.ts:63-67`
  - `createAndOpenPane.ts:22-28`
  - `RunNpmScriptFeature.ts:84-90`
  - `RevealPaneFeature.ts:25-31`
  - `VsCodePanesView.ts:142-150`

  astra: the helper is small and adds no owner. The lookups differ in policy: the view and reveal ignore a missing Pane, while create and run report an error. Merge them only when the policies actually match. Do not reintroduce a `NavigationPaneOpening` under a new name.

### K. Stale names and document status
- **Classification:** astra-confirmed. **Severity:** minor.
- **Evidence:**
  - `test/extension/pane-command.test.ts:104`: the `withPanesFeature` helper now builds `VsCodePanesView` (D18).
  - `test/extension-composition/fake-herdr.ts` (the CLI executable) sits next to `fakeHerdr.ts` (the socket server), so the two names are easy to confuse.
  - `docs/architecture/ARCHITECTURE.md:3` and `IMPLEMENTATION.md:3` still say "Status: proposed".
- **Fix:**
  - Rename the test helper to `withPanesView`.
  - Rename the fixtures to `fakeHerdrCli.ts` and `fakeHerdrServer.ts`, and update the build output path that `composition.test.ts:47` checks.
  - Set both documents to "Status: canonical." (astra's wording).
  - Leave historical design docs unchanged.

### L. The projection union is declared three times
- **Classification:** not a defect after consultation (accepted cost of D10).
- **Evidence:** the union (three variants plus the union type) is declared identically in:
  - `modules/sessions/activeSessionProjection.ts:4-23`
  - `modules/pane-editors/session-source.ts:3-22`
  - `modules/workspace-context/source.ts:3-22`

  `PaneEditorPresence` is declared twice. Both consumers use every field, including `reason` (`paneTarget.ts:35`, `NavigationContextModel.ts:135,185`). Each declaration is a structural type next to its consumer, not a second state or a second set of rules. Type checking in composition keeps them compatible.

## astra's answers that shaped the verdicts

- **Q1 (what to check):** check responsibilities, not import paths. Confirm a single authority per fact, runtime loadability of the public entries, and the timing of reads around `await`. For every new class, interface and helper, ask which responsibility it has of its own. Flagged as risky: D10 (local contracts must not copy a peer's whole API), D16/D17 (re-evaluate the open-request helper), D6 (no new adapters around two strings), D18 (structural arguments must not widen availability), D15 (no second emitter) and D4 (the size of `SessionsModel` is deferred to #68). Leftovers to look for: facades kept under new names, test-only exports, comments about removed owners. The word "Navigation" in `NavigationContextModel` is not a leftover.
- **Q2 (verdicts):**
  - Fix in this PR: A, B, C, D, E, F, G, K. Not defects: H, I, J, L.
  - Constraints on the fixes:
    - Keep behavior checks; tests move to the new owners, and no assertion is dropped.
    - Keep the disposal order in G.
    - Do not widen the PR into #67 or #68.
    - Add no new frameworks or services.

## What I checked and did not check

**Checked:**
- ARCHITECTURE, IMPLEMENTATION, ADR 0014/0015, D1–D19 and the earlier final reviews (I did not repeat their findings).
- Every block's public `index.ts`, and which exported symbols are actually imported across blocks.
- `HerdrExtension` composition and lifecycle against `origin/main`.
- All feature files.
- The sidebar, connection-status and npm-scripts views, with diffs.
- The new and moved `modules/sessions`, `modules/pane-editors` and `modules/workspace-context` files.
- The `api/herdr` contracts and the executable-source shapes.
- The ESLint, tsconfig and vitest alias changes.
- Comments and docs outside `docs/design/` that refer to the old structure.
- Test helper names.

**Not checked:**
- Behavior preservation and assertion baselines (covered by `spec.md` and `spec-2.md`).
- Line-by-line review of the moved `api/herdr` and `PaneTerminalSurface` internals beyond their import diffs.
- `SessionsModel` internals beyond the D15 and executable changes.
- Historical documents under `docs/design/` and `docs/research/`.

**Not run:** tests, lint or typecheck.
