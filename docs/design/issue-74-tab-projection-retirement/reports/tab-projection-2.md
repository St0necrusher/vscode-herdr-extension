# Tab Projection diagnosis — round 2

- **Status:** production defect confirmed; no production code or approved assertions changed.
- **H1:** confirmed in the current build: after each move, active `p6E` is a `TabInputTerminal`, but public Pane Editor presence is empty.
- **H2:** refuted as the primary cause: both moved-tab layouts exactly match the test literals before navigation.
- Current manager: isolated D2 leaves the moved `p6E` editor tab and Terminal open after navigation; isolated shared-group case also leaves its Terminal open.
- Baseline `c989928` manager-only build: both isolated tests still fail the Pane Editor close invariant; it removes the moved tab but leaves the Terminal open.
- Thus the I7 bound-only filter changes the visible failure (skips an unbound grid member) but is not the sole cause; the pre-I7 behavior also fails.
- **Root:** `reconcileTabBindings` matches only `managed.terminalName` after the Pane Editor has been renamed to its Pane display title.
- **Proposal:** restore rename-independent binding for moved editor-area terminals before applying the Panel-only retirement distinction; retain the I7 guard.
- Do not simply remove the bound-only guard: the baseline comparison still fails, and Panel terminals must remain open.
- The full-run shared-group “Pane p6E appears once” assertion was order-sensitive; isolated runs fail at the common close invariant instead.
- Throwaway instrumentation and baseline build script were deleted; no debug code remains in test files.
- Cleanup checks: `npm run build` (includes typecheck), `npm run lint`, `npm run format:check`, and `git diff --check` passed.

## Reproduction and host evidence

The diagnostic used the existing failing tests, first together and then individually in clean extension-test windows. The focused current-manager invocation was:

```sh
npx vscode-test --config .vscode-test.mjs --label extension \
  --run dist/test/extension/tab-layout.test.js \
  --grep 'a dragged Tab Projection Pane Editor|clicking a projected Pane Editor that shared a group'
```

Each case also reproduced individually (one selected test, one failure). Immediately after the move and immediately before navigation, the D2 host state was:

```text
groups: [[file.txt (other input), p6D (TabInputTerminal), p6E (TabInputTerminal)]]
active editor tab: p6E
open Terminals: p6D, p6E
getPaneEditorPresence(): { visible: [] }
```

The shared-group state was likewise exactly `[[p6D, p6E]]`, with `p6E` active, both inputs `TabInputTerminal`, both Terminals open, and Pane Editor presence empty. These observations refute a move command that failed or a wait that settled on the wrong layout. Since `getPaneEditorPresence()` includes an active Pane Editor only when the manager has a bound Tab for it (`updatePresence`, `PaneTerminalSurfaceManager.ts:266-275`), the empty presence is public evidence that active `p6E` is no longer bound.

With the current manager, the isolated D2 navigation leaves `p6E` in the editor group beside `file.txt` and leaves its Terminal open; `p69` opens. In the isolated shared-group case, navigation focuses `p6D`, but the displaced `p6E` Terminal remains open (its title changes back to the internal `tab-layout-1:p6E`). Both fail `only expected displaced Pane Editor p6E closes`. When the cases run sequentially, D2 leaves a live `p6E` behind and the following shared-group case can instead fail the tab-count assertion; that earlier assertion is a secondary ordering/cascade symptom, not evidence that the shared-group setup failed.

## Baseline comparison

A temporary esbuild plugin replaced **only** `PaneTerminalSurfaceManager.ts` with `git show c989928:src/modules/pane-editors/PaneTerminalSurfaceManager.ts`; the plugin logged that it intercepted `./PaneTerminalSurfaceManager`, and the resulting bundle contained the pre-I7 `members.filter((managed) => managed !== target)` path. Each target test was then run separately against that bundle.

Both baseline runs still failed the same close invariant. For D2, the old manager removed the moved `p6E` editor tab, but `p6E` remained in `vscode.window.terminals`. For the shared-group case, the group contained only `p6D` after navigation, but the `p6E` Terminal remained live. Therefore c989928 does not pass these tests: the I7 guard explains why the current implementation leaves the editor tab in the grid, but reverting it is not a sufficient fix for the Terminal-lifecycle assertion.

## Root cause and proposed repair

`PaneTerminalSurfaceManager.reconcileTabBindings` (lines 252-262) recovers a missing Tab only when its `TabInputTerminal` label equals `managed.terminalName` (lines 255-257). On first binding, it calls `surface.showPaneName()` (line 258). `VsCodePaneTerminalSurface.showPaneName`/`publishPaneName` changes the visible title from the internal `${sessionId}:${paneId}` to the Pane's display name (`PaneTerminalSurface.ts:191-199, 252-265`). After the editor is moved, the host snapshot still shows a `TabInputTerminal` labelled `p6E`, while the internal `managed.terminalName` is `${sessionId}:p6E`. When the prior binding is invalidated, the lookup by that internal label cannot match the displayed Pane title; the empty public presence is consistent with `managed.tab` being undefined. The I7 filter in `navigateToPane` (`PaneTerminalSurfaceManager.ts:58-63`, especially line 61) then treats this in-grid moved member like an unbound Panel member and skips it.

**Proposed minimal fix for the coordinator/architect:** make reconciliation preserve or recover the surface-to-editor-Tab association across editor-group moves independently of the mutable display title, then retain the I7 check so an actual Panel terminal (which has no editor Tab) remains open. Do not remove the guard by itself. A simple current-terminal-name fallback is a candidate, but should be checked for collisions; the VS Code 1.141 public `TabInputTerminal` type exposes no Terminal reference (`node_modules/@types/vscode/index.d.ts:19287-19294`), so the stable public association strategy needs an explicit design choice. Also ensure the moved-member retirement path disposes the underlying Terminal: the c989928 comparison demonstrates that removing only its editor tab does not satisfy the approved close behavior.

No user-facing terms or durable design decisions were introduced by this diagnosis. No CONTEXT or ADR change is proposed until the coordinator/architect selects the repair.

<!-- end of reply -->
