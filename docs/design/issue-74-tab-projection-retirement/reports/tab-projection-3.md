# Tab Projection test slice — round 3

- **Status:** H3 wait added to the two requested tests; both still fail after the rebind settles.
- **D2:** isolated test fails `only expected displaced Pane Editor p6E closes` (`false !== true`).
- **Shared-group:** isolated test fails the same close invariant (`false !== true`).
- Both waits settle on the exact expected editor-group layout and visible `p6E` presence before navigation.
- Diagnostic confirms both presences belong to `sessionId: tab-layout-1`, `paneId: p6E`; the `p6E` tab still represents the original Terminal object.
- Architect `astra-arch-74` confirms this is a production-behavior defect against accepted D2/ADR 0018; no design amendment.
- Keep the waits and approved assertions unchanged; no production files changed.
- Combined focused run: 0 passed / 2 failed (D2 close assertion; shared-group wait timed out after D2 failed).
- Fresh-host isolated runs: D2 0/1; shared-group 0/1; both fail at the close invariant.
- `npm run build` (includes typecheck): passed; `npm run lint`: passed; `npm run format:check`: passed.
- `git diff --check -- test/extension/tab-layout.test.ts`: passed.
- Repository-wide `git diff --check` flags a trailing blank line in coordinator-modified `progress.md`; that file was left untouched.
- Full validation was not run because the focused tests remain failing; prior round-1 unit result was 158/158.
- The c989928 baseline observation remains a separate clue only; it was not rerun after H3 and does not explain away the settled failures.
- Temporary H3 logging was removed; no commits or pushes.

## Change made

Only `test/extension/tab-layout.test.ts` was changed in this round. The D2 and shared-group tests now use `waitForPaneEditorRebind` before navigation. That bounded `waitForEditorGroups` probe requires both the literal expected group layout and the public `manager.getPaneEditorPresence().visible` list to contain the moved Pane. It does not alter or weaken any approved assertion. The helper is applied only to these two move scenarios; it includes a short comment identifying the #73 rebind cycle.

## Host results

Focused command, initially with both scenarios selected:

```sh
npx vscode-test --config .vscode-test.mjs --label extension \
  --run dist/test/extension/tab-layout.test.js \
  --grep 'a dragged Tab Projection Pane Editor|clicking a projected Pane Editor that shared a group'
```

Result: 0 passing, 2 failing. D2 reached navigation and failed `only expected displaced Pane Editor p6E closes` (`false !== true`). The shared-group case then timed out waiting for editor groups. To rule out residue from D2, each test was rerun separately in a fresh VS Code host; each bounded wait resolved and each test independently failed the same close invariant (`0 passing, 1 failing`).

Temporary, tagged logging after each wait confirmed the full public state before navigation:

- D2 layout: `[["file.txt", "p6D", "p6E"]]`; shared-group layout: `[["p6D", "p6E"]]`.
- Both: `getPaneEditorPresence()` returned `visible: [{ sessionId: "tab-layout-1", paneId: "p6E" }]` and `focused: { sessionId: "tab-layout-1", paneId: "p6E" }`.
- Both: `paneTerminal("p6E")` was strictly the same `vscode.Terminal` object captured before the move (`sameTerminal: true`), with terminal name `p6E`.
- The unchanged failing postcondition is `only expected displaced Pane Editor p6E closes`; in these settled runs the recorded `onDidCloseTerminal` set did not contain the expected closed Terminal. No post-failure terminal-list claim is made from this assertion alone.

## Architect answer and classification

Request: `requests/luna-tests-74-q1.md`; answer: `answers/luna-tests-74-q1.md`. The architect rules this an **explanation of accepted behavior, not an amendment**: a moved member that has rebound in the editor grid retains Tab Projection membership and must close on a later navigation click when it is not the target. I7's exception applies to an unbound Pane Editor in the Panel, not this settled, visible grid member. S1–S4 still determine the clicked target's fate after other members close.

The architect classifies the remaining failure as a production-behavior defect against D2 and assigns the specific move → rebind → retirement/close diagnosis to the coordinator. The failure alone does not identify whether membership, object selection, or the close lifecycle is responsible; no production change is authorized in this test-worker slice. The test oracle is now verified for session, Pane, and Terminal identity.

Issue #73 (`gh issue view 73`) explains the transient unbind/rebind cycle, but its accepted deferral is not blanket permission to violate D2 after the cycle settles. The earlier c989928 comparison showed the pre-I7 close attempt removed the moved editor tab while the Terminal remained live, but that baseline was run before the H3 wait. It remains a separate diagnostic lead, not an explanation that supersedes the current settled-host evidence.

## Validation and cleanup

- `npm run build` — passed (includes `npm run typecheck`).
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `git diff --check -- test/extension/tab-layout.test.ts` — passed.
- Repository-wide `git diff --check` reports `docs/design/issue-74-tab-projection-retirement/progress.md:124: new blank line at EOF`. That file was already coordinator-modified and is outside this worker's write boundary; it was not edited.
- `npm test` and the full `npm run test:extension` sequence were not rerun because H3 did not make the focused tests pass. Round 1 had 16/16 unit files and 158/158 tests passing; extension suite blockers remain.
- Temporary tagged logging used to verify the test oracle was removed and the source rebuilt. No production files, approved assertions, or design files were changed by this round.

<!-- end of reply -->
