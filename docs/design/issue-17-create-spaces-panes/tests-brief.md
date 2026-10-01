# Brief: tests for issue #17 (Create server-owned Spaces and Panes)

You were dispatched by the Claude session `vscode-herdr-extension-62` (Herdr pane `w3:p27`). The user is in your tab and will choose and write tests with you.

## Goal

Write durable tests for the #17 implementation by following the repository's test workflow in `.claude/skills/tests/SKILL.md`. That file is the `/tests` skill. It has `disable-model-invocation`, so read it and follow it directly. If the user prefers, they can type `/tests` in your tab.

You are done when:
- the user has approved the test scenario set;
- those tests are written;
- `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:extension` pass;
- the user accepts the result.

## State of the work

- Branch `feat/issue-17-create-spaces-panes`. The implementation is committed as `343e5ab` ("feat: create Spaces and Panes from VS Code", `Closes #17`). The user tested it manually and accepted it. Nothing has been pushed and there is no PR yet.
- Requirements: `gh issue view 17`.
- Design, including the accepted deviations: `docs/design/issue-17-create-spaces-panes/architecture.md`. History is in `progress.md`.
- Architecture rules: `docs/architecture/code-architecture.md`, section "Tests and guardrails".
- Scenario selection rules: `.claude/skills/testing-scenarios.md`. Apply its "After implementation and human review" branch.
- Domain terms: `CONTEXT.md`.

## Implemented contracts (seams to test)

- `src/capabilities/sessions/creation.ts`: `ActiveSessionCreation { createSpace, createPane, splitPane }`.
- `HerdrSessionConnection` gains `createSpace(cwd)`, `createPane(spaceId)` and `splitPane(paneId, direction)`.
  - `JsonSocketHerdrSessionConnection` sends `workspace.create {cwd, focus:false}`, `tab.create {workspace_id, focus:false}` and `pane.split {target_pane_id, direction, focus:false}`.
  - After the response it marks the connection dirty and reconciles until that dirty mark is consumed. The promise resolves only after a snapshot requested after the response has been published (decision D2). This uses a dirty flag, not sequence counters.
- `SessionsModel` / `SessionsFeature`: creation is rejected without sending a request unless the active Session is `connected` and its id matches the request's `sessionId`.
- `NavigationPaneOpening.openPane(paneId)`, implemented by `PanesFeature`:
  - it resolves the Pane against the whole Session snapshot (D3);
  - it throws if the Pane is not found.
- Commands:
  - `PanesFeature`: `herdr.createPane`, `herdr.splitPaneRight`, `herdr.splitPaneDown`;
  - `SpacesFeature`: `herdr.createSpace`;
  - New Space selects the created Space and opens its root Pane.
- Folder choice for New Space:
  - single folder: used without a prompt;
  - multi-root: the built-in `showWorkspaceFolderPick`, where Esc cancels;
  - no folder: an error is shown and no request is sent.
- Failures: a creation error shows an error notification. When opening fails after a successful creation, only an error notification is shown and nothing is rolled back.
- Context keys (D4), set by the Views:
  - `herdr.spaceCreationEnabled`: the Session is connected;
  - `herdr.paneCreationEnabled`: the Session is connected and a Selected Space exists.

  They drive `enablement` in `package.json`.

## Existing test locations and patterns

- Socket adapter integration: `test/integration/herdr-socket/JsonSocketHerdrSessionConnection.test.ts`, which uses a fake socket server.
- Sessions behavior: `src/features/sessions/SessionsModel.test.ts`.
- Feature/command-level extension-host tests with fake capabilities: `test/extension/pane-command.test.ts`. This is the pattern for the Panes and Spaces flows. Other extension tests are in `test/extension/`.
- The #17 commit only added creation stubs that throw to the fakes in `SessionsModel.test.ts`, `test/extension/sessions.test.ts` and `pane-command.test.ts`. No creation behavior is covered yet.

## Preliminary scenario recommendation (from the design phase; reconcile against the code, do not take as final)

Critical:
1. **Socket**, adapter integration:
   - each of the three requests sends the documented params, including `focus:false`;
   - the promise resolves with the created ids only after a snapshot requested after the response has reached the consumer;
   - a Herdr error rejects and leaves the connection open.
2. **Sessions guard**, behavioral: no request is sent when the Session is stale, incompatible, or the `sessionId` is not the active one. When connected, the request is delegated.
3. **New Space flow**, extension test with fake capabilities:
   - single folder: `createSpace` is called with that cwd, then the Space is selected and its root Pane opened;
   - multi-root cancel: no request;
   - no folder: no request.
4. **New Pane and Split flows**, extension test:
   - the correct request is sent and the created Pane is opened;
   - when opening fails after a successful creation, an error is shown and no further server call is made.

Optional: context keys follow stale and no-Space transitions.

Excluded:
- VS Code QuickPick and notification rendering;
- Herdr's own cwd defaults;
- menu wiring in the manifest beyond `enablement`;
- active-editor-first folder ordering (dropped as an accepted deviation).

## Rules

- Present the reconciled scenario list to the user and get approval before writing any test. Explain any changes from the preliminary list.
- Test observable behavior at the narrowest stable public seam. Do not add production exports, facades or hooks just for tests. Do not assert on private fields.
- Do not change production code. If a test exposes a production defect, stop and report it to the user before changing anything.
- Do not weaken existing tests.
- No defensive over-engineering: no tests for impossible states or contract-breaking mocks.
- If you delegate, use `gpt-6-luna` workers through the `multi-agent-delegate` skill. You review their output, and only typecheck runs after each slice.
- Chat with the user in Russian. Write code, comments and commit messages in English.
- Do not commit, push, or open a PR unless the user tells you to in your tab.

## Output

Report only once, when the tests are written and the user has accepted them. Send no intermediate updates. When done, send the complete result with SendMessage to `vscode-herdr-extension-62`, then stop. Include:
- the approved scenario list and how each scenario is covered (file and test name);
- the validation commands and their outcomes;
- any production defects found;
- the commit state;
- what remains open.
