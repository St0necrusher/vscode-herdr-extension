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

- **D13. Shape of `api/herdr`** (astra, 2026-10-07). The issue tree is a starting map; §3 decides. Shared Herdr data and `HerdrConnectionFailureError` live in `api/herdr/shared/` (no root `types.ts`); parts reach them through `../shared`, and `api/herdr/index.ts` re-exports what other blocks need, so consumers keep `@api/herdr`. `protocol/` is a part of `connection/` while only the connection uses it; `connection/shared/` only for code several connection parts use. `pane-clients/` and `takeover/` are parts of `api/herdr` taking the executable as a parameter or an injected current-value source. No rules change.
- **D14. Test decisions go to astra.** The user delegated approval of test changes and architecture questions to astra. First case: `SessionsModel.test.ts:333` asserts `start` with `configuration.executable` instead of `configuration` (D6 changes the dependency contract, not the behavior).

- **D15. Active Session projection after the facade** (astra). `SessionsModel` provides `getActiveSessionProjection()` (its state mapped through `activeSessionProjection`) and `onDidChangeActiveSessionProjection()` (wrapping its own `onDidChange`). No separate object, no second store, no new publish order; the projection test is constructed on `SessionsModel` with its assertions unchanged.

## Slices

| # | Slice | Status |
|---|---|---|
| 0a | Characterization tests in existing test files | done |
| 0b | Real-composition extension test against a fake herdr | done |
| — | Baseline of test names and assertion lines | pending |
| 1a | Aliases, ESLint layer rules, `core/` | done |
| 1b | `api/herdr` (cli, connection, protocol, types) | done |
| 2a | `modules/sessions` (`SessionsModel` as one unit, projection mapping), `ARCHITECTURE.md:100` | done |
| 2b | `views/sidebar/sessions`, `views/connection-status`, `features/start-local-session`, `features/configure-executable`; `SessionsFeature` removed | done |
| 3a | `api/herdr/takeover`, `features/manage-takeover-plugin` (moved before the module: `PaneTerminalSurface` imports takeover) | done |
| 3b | `modules/pane-editors`, `api/herdr/pane-clients`; `capabilities/terminalSurfaces` dissolved | done |
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
- 2026-10-07: 1b accepted after one question round (D13, D14). `src/infrastructure/herdr/` removed; directory operations take the executable path. Assertion changes: D14 and the CLI test call arguments (D6) only.
- 2026-10-07: 2a accepted after one correction (structural conformance instead of `implements HerdrConfigurationActions` in `VsCodeHerdrConfiguration`, which 2b deletes). `src/capabilities/sessions/` removed; D5 rules text edited. 2b briefed with D15.
- 2026-10-07: 2b accepted after one review round (flat constructor cleanup in `HerdrExtension`, single dispose on initialization failure, status owner renamed `ConnectionStatus`). `src/features/sessions/` and `src/infrastructure/vscode/` removed; D3 tests rewritten per owner (mapping in report 2b). Slices 3a/3b swapped: takeover moves before the Pane Editors module.
- 2026-10-07: delegation workflow revised (user-approved retro, `.claude/skills/delegating-slices.md`): from the slice after 3a, slice briefs come from a brief-author subagent (sonnet, medium) — 3b keeps the brief the coordinator had already written; every slice gets a shadow review (reviewer subagent, opus, high, plus the coordinator's own diff review), both findings recorded here; astra answers questions in `answers/<slice>.md` and adds the D-entry itself; waiting and watching use `multi-agent-delegate/scripts/{wait-report,watch-pi}`; the common brief now asks for foreground validation, a summary of at most 20 lines, and excerpt reading.
- 2026-10-07: 3a accepted after one correction. Shadow review: the reviewer (opus) found an unused `TAKEOVER_PLUGIN_ID` export added to `api/herdr/takeover/index.ts`, which the coordinator missed; the coordinator found nothing the reviewer missed. `src/infrastructure/pane-editors/takeover/` removed; the api part takes a narrow `HerdrExecutableSource`.
- 2026-10-07: 3b accepted after one import-only correction round. `src/infrastructure/` and `src/capabilities/` removed; `stopWithEscalation` → `core/process`; `HerdrExecutableSource` → `api/herdr/shared`; `modules/pane-editors/session-source.ts` declares the module's Session dependency types. Shadow review: both found the unused exports in `modules/pane-editors/index.ts` (inherited from the old index); only the reviewer found the repeated `@api/herdr` imports.
