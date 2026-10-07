# Progress: architecture migration (#66)

Coordinator: Claude session `claude-migration` (Herdr pane `w3:p4G`). Worktree `/Users/kuzmichev/dev/vscode-herdr-extension-66`, branch `refactor/66-architecture-migration` from `origin/main` at `4450ad9`. Architecture consultant: pi agent in the Herdr tab `astra` (pane `w3:p4F`).

Execution plan approved by the user on 2026-10-07.

## Decisions

- **D1. Slicing.** The order is a chain of verticals run one after another: foundation, Sessions, Pane Editors, Workspace Context, navigation, npm scripts, cleanup. Each step consumes the public entry of the step before it, so they cannot run in parallel. Only 0a and 0b run in parallel (disjoint files, separate worktrees).
- **D2. Safety net first.** Step 0 adds characterization tests on the current code, then the coordinator records a baseline of test names and assertion lines. After every slice no test may disappear and no assertion may change, except D3.
- **D3. The only approved assertion change.** `test/extension/sessions.test.ts:150` (exact registration order of the seven `SessionsFeature` commands) and `:244` (partial-registration cleanup at index 2) are rewritten in slice 2b per new owner: each owner registers its commands and cleans up after a partial failure. The full command set is pinned by the 0a "all contributed commands registered" test.
- **D4. `SessionsModel` moves as one unit** into `modules/sessions`; no state-owner split. Reconsidering the split is #68.
- **D5. The immediate recovery attempt stays in `modules/sessions`** with the reconnect schedule. `ARCHITECTURE.md:100` changes "one recovery attempt" to: the API performs the connection and initial synchronisation on request; the module decides when to retry. Docs edit in slice 2a.
- **D6. Settings.** `core/` gets a generic settings reader and change subscription parameterised by section and keys. Binding it to the Herdr settings lives in `extension/`. `HerdrConfiguration` becomes a `modules/sessions` type. `api/herdr` takes the executable path, not the configuration object, and still reads it before each operation (no value captured at startup). Construction changes in `HerdrCliSessionDirectory.test.ts` are allowed; assertions stay. `selectExecutable` → `features/configure-executable`, `openSettings` → `views/connection-status`.
- **D7. `api/herdr/types.ts` holds only Herdr data**, requests to Herdr and protocol events. Application state and operations go to their module; a narrow dependency of a consumer sits beside that consumer. Types still used by old code move with their owner or consumer; no module is created only to hold types. A temporary re-export is allowed only when its brief names the slice that removes it.
- **D8. Takeover.** Plugin CLI (list, copy, install, remove) and the last known registration state → `api/herdr/takeover`. Commands and user messages → `features/manage-takeover-plugin`. The offer decision stays in `modules/pane-editors`. No new synchronisation. #67 stays out of scope.
- **D9. Sidebar rules.** `worktreeGroup()` and Pane closability (ADR 0005) move to `modules/sessions` in slice 5a with their tests. The view reads availability; the feature re-checks the rule on current data before acting.
- **D10. Consumer-declared types.** `modules/workspace-context` declares its own narrow dependency types (no type imports from peer modules). Features may import public types and operations of modules: `run-npm-script` and `reveal-pane` open an editor through `modules/pane-editors`, not through another feature.
- **D11. ESLint grows with the stages.** Slice 1a adds layer rules and elements for the new layers while the old elements stay; each slice adds what its new folders need; slice 6 removes the old elements and verifies allowed and forbidden imports.
- **D12. Workers.** Each slice gets a fresh pi worker on `openai-codex/gpt-6.1-sol --thinking medium` (a #66-only exception to `delegating-slices.md`). Workers stay under ~150k context and hand off before crossing it. Worker questions go to the coordinator, who resolves them with astra or the user. The coordinator writes no code.

## Slices

| # | Slice | Status |
|---|---|---|
| 0a | Characterization tests in existing test files | done |
| 0b | Real-composition extension test against a fake herdr | done |
| — | Baseline of test names and assertion lines | pending |
| 1a | Aliases, ESLint layer rules, `core/` | done |
| 1b | `api/herdr` (cli, connection, protocol, types) | pending |
| 2a | `modules/sessions` (`SessionsModel` as one unit, projection mapping), `ARCHITECTURE.md:100` | pending |
| 2b | `views/sidebar/sessions`, `views/connection-status`, `features/start-local-session`, `features/configure-executable`; `SessionsFeature` removed | pending |
| 3a | `modules/pane-editors`, `api/herdr/pane-clients`; `capabilities/terminalSurfaces` dissolved | pending |
| 3b | `api/herdr/takeover`, `features/manage-takeover-plugin` | pending |
| 4 | `modules/workspace-context` | pending |
| 5a | `views/sidebar/{spaces,panes,agents,shared}`, create-space, create-pane, rename, close, reveal-pane | pending |
| 5b | `views/npm-scripts`, `features/run-npm-script`; `NavigationFeature` removed | pending |
| 6 | Remove `capabilities/`, `infrastructure/`, old ESLint elements; verify ESLint; doc paths | pending |

## Log
- 2026-10-07: baseline on `054c1bc` — lint, format, Vitest (140 tests) green; `test:extension` 47 passing, 1 failing locally (`Run Script in Herdr › package.json hover offers Run in Herdr while connected…`: 2 links instead of 1). CI on the same commit is green; the failure reproduces with fresh VS Code user data. Treated as a known local exception; CI is the gate.
- 2026-10-07: 0a dispatched to pi `sol-0a` (pane `w3:p4J`, worktree `-66`); 0b dispatched to pi `sol-0b` (pane `w3:p4K`, worktree `-66-0b`, branch `refactor/66-0b`). Each worktree has its own `.vscode-test/user-data`.
- 2026-10-07: 0a accepted after review: 11 new tests (7 behaviors), no existing assertion changed. Criterion 2 limits accepted: Agent rows carry no contextValue; the npm scripts tree belongs to VS Code's npm extension; a non-closable grouped Pane row is unreachable. Validation: Vitest 141 passed; extension 57 passing, 1 known local failure.
- 2026-10-07: 0b accepted after one review round (ESLint element instead of per-file disables; explicit activation-order guard). Mutation checks: removing the `pane.moved` subscription or the navigation projection fails the suite. Known risk: VS Code does not guarantee that the test bundle loads before `onStartupFinished` activation; the suite fails with a named "activation-order race" message if it does. Watch CI.
- 2026-10-07: second known local exception: fresh-window `The first Pane Editor of a window › takes keyboard focus from the Panes View` times out on this machine depending on which app holds OS focus (fails on `6d1d6b9`, where it passed earlier). CI is the gate.
- 2026-10-07: baseline of test titles and assertion lines taken at `2519366` (177 `test`/`it` titles, 1095 lines). After each slice: lines of the baseline missing from the current snapshot must be explained by D3 or reviewed as import/construction changes.
- 2026-10-07: settings (D6) move in slice 2b instead of 1a: the generic core reader has its first consumer only when `VsCodeHerdrConfiguration` is split.
- 2026-10-07: 1a accepted after one correction: the core logger is generic (`Logger`, `VsCodeLogger(name)`; composition passes "Herdr"). ESLint layer rules verified by the worker on an allowed/forbidden import matrix (report 1a). Next: 1b.
