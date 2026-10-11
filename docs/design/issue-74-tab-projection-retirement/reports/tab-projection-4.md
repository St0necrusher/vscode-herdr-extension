# Tab Projection test slice — round 4

- **Status:** updated only `test/extension/tab-layout.test.ts`; no production changes.
- Added `expectClosedAfterMove` for moved Pane Editors whose close event/registry behavior differs in VS Code 1.141.
- Those terminals are verified by editor-tab removal and live Pane client count `0`; ordinary terminals retain existing close-event and registry checks.
- Applied the moved-close expectation to D2 and the shared-group case; kept the bounded #73 rebind wait.
- Added current-harness terminal lookup so sequential cases do not select a stale disposed Terminal retained by VS Code.
- Focused D2/shared-group run: **2 passed**.
- `npm run typecheck`: passed; `npm run lint`: passed; `npm run format:check`: passed.
- `npm test`: **16/16 files, 158/158 tests passed**.
- `npm run test:extension`: **100 passed** in the extension host; real composition **1 passed**.
- Known baseline exception: fresh-window focus **0 passed / 1 failed**, `takes keyboard focus from the Panes View` (timeout waiting for Pane Editor keyboard focus).
- The full validation chain exits 1 only because of that known fresh-window exception.
- `git diff --check`: passed.
- No new product domain term or hard-to-reverse product decision; no CONTEXT or ADR entry proposed.
- No commit or push.

## Change details

`LayoutHarness` now exposes `expectClosedAfterMove(...terminals)`. It registers these as expected closed and separately marks them for the VS Code moved-terminal behavior. In navigation postconditions, only marked terminals skip `onDidCloseTerminal` and `vscode.window.terminals` checks; instead the harness verifies that no editor tab remains for the Pane and its tracked live Herdr client count is zero. The one-line comment cites the host behavior and C10 precedent (`test/extension/pane-editors.test.ts:240-263`). All non-moved terminal postconditions are unchanged.

The D2 test declares `p6D` with the ordinary close expectation and moved `p6E` with `expectClosedAfterMove`. The shared-group test declares only moved `p6E` with the new expectation. Both retain `waitForPaneEditorRebind`, which waits for the expected literal group layout and public visible Pane Editor presence before navigation; dropping it would reintroduce the documented transient unbound interval.

VS Code 1.141 retains a disposed moved Terminal in `window.terminals`. Since the tests reuse Pane IDs in one extension host, a later `paneTerminal("p6E")` can find that stale object. The harness-only `getOwnedTerminal` returns the latest Terminal created by the current harness for that Pane, ensuring the shared-group test declares/checks the actual current instance. This does not alter production behavior or weaken closure assertions.

## Focused and full validation

Focused command:

```sh
npx vscode-test --config .vscode-test.mjs --label extension \
  --run dist/test/extension/tab-layout.test.js \
  --grep 'a dragged Tab Projection Pane Editor still closes on navigation|clicking a projected Pane Editor that shared a group keeps its identity after the other closes'
```

Result: **2 passing**. Both scenarios now reach navigation and verify the moved Pane's editor tab is gone and its live client count has returned to zero. The moved-terminal event/enumeration behavior is not used as a close oracle for these two terminals.

Required validation command:

```sh
npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension
```

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed; all matched files are formatted.
- `npm test` — passed: **16 test files, 158 tests**.
- `npm run test:extension` — extension host: **100 passing**; real Herdr extension composition: **1 passing**.
- Fresh-window suite — **0 passing / 1 failing**: `The first Pane Editor of a window` → `takes keyboard focus from the Panes View`, timed out waiting for the Pane Editor to report keyboard focus. This is the task's known baseline exception; it is the sole reason the full command exited 1.
- `git diff --check` — passed.

The pre-existing working-tree changes in `docs/design/issue-74-tab-projection-retirement/progress.md` and `test/extension/agents-navigation.test.ts` were not edited in this round. No production, fixture, or design files were changed.

<!-- end of reply -->
