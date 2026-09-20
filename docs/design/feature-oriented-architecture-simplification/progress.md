# Migration progress

## Scope and approval

- User explicitly approved implementation on 2026-09-19.
- Repository-wide migration: apply the canonical architecture to every current source and test module, including code predating issue #11. The issue #11 implementation is the behavior baseline, not the scope boundary.
- The current repository inventory contains Sessions, Herdr CLI/socket infrastructure, shared VS Code infrastructure, extension composition, and extension/integration tests; no additional product feature tree exists outside these responsibilities.
- Preserve all existing issue #11 behavior.
- Update architecture lint and tests for the new ownership graph.
- Remove obsolete catalog, active-session, controller, central command-router, persistence-adapter, broad feature `vscode/`, and superseded infrastructure layers only after their responsibilities have moved.

## Exclusions

- No issue #12+ behavior, reconnect policy, new product behavior, speculative feature directories, DI container, service locator, event bus, generic repository, or compatibility facade.
- No staging, commit, push, or issue closure.

## Existing worktree

The migration starts from a large uncommitted issue #11 working tree that belongs to the user and must be preserved. Initial status was captured before migration. Baseline fingerprints:

- tracked diff SHA-256: `2797cc5e343ab4116ebf979daab0998d97ff475a91386803efa943142fc9680d`
- untracked manifest/content SHA-256: `df013481a60df8eeeb6312df1456b8da124af691c0b3bea11c7538bcf86cbce1`

All source, tests, documentation, lint, package, media, and integration files shown by the initial `git status --short` predate this migration except this task directory.

## Acceptance criteria

- One `SessionsModel` owns aggregate catalog and active state and exposes one state source and operation surface.
- `SessionsFeature` is composition/lifecycle only; Views and Status consume aggregate state.
- Parent presentation is under `sessions/view/`; Status is a child feature under `sessions/status/` with its own View and pure derivation.
- Retry routing, selection persistence semantics, connection generations, projection authority, observer isolation, and lifecycle behavior remain in the model.
- Persistence uses one injected minimal key-value capability backed directly by `workspaceState`.
- Obsolete layers and forwarding facades are removed after transfer.
- Public Session capabilities, socket responsibilities, and shared VS Code infrastructure are split/flattened as required without changing protocol behavior.
- ESLint does not restrict `vscode` imports by path, while continuing to enforce dependency direction, public entries, sibling isolation, cycles, and production/test isolation.
- Existing and migrated tests cover stable observable behavior and all repository checks pass or have documented external blockers.

## Baseline validation

`npm run typecheck && npm run lint && npm test` stopped at typecheck before migration. The known Phase 0 test-contract mismatch is present: tests still import `HerdrSessionDiscovery` and call `discover()` although production now exposes `HerdrSessionListResult` and `list()`. No lint or tests ran because the command short-circuited. This is pre-existing migration input, not evidence of a green baseline.

## Current activity

- Implementation, parent reconciliation corrections, lint migration, and socket structural reconciliation are complete.
- Parent full validation passed.
- Final independent review: pending.

## Implementation slice evidence (2026-09-19)

### Changed source ownership

- Added `src/features/sessions/SessionsModel.ts` as the sole aggregate state/operation owner.
- Split the repository Sessions capability public entry into semantic `configuration.ts`, `session.ts`, `snapshot.ts`, `directory.ts`, and `connection.ts` files with deliberate exports from `index.ts`. It owns catalog and active slices, discovery revisions, selection precedence, serialized persistence, start/retry routing, connection generations, projection publication, observer isolation, and disposal.
- Added `src/features/sessions/view/` and `src/features/sessions/status/` (`StatusFeature`, pure `statusModel`, and Status View). `SessionsFeature` now only composes/owns the model, parent View, and Status child.
- Injected one `PersistentKeyValueStorage` directly into `SessionsModel`; `HerdrExtension` passes `context.workspaceState` structurally.
- Removed catalog, active-session, controller, central command router, selection adapter/store, and broad Sessions `vscode/` implementations.
- Extracted `JsonSocketClient` from logical connection code, split protocol responsibilities into `HerdrProtocol.ts`, `HerdrSubscriptions.ts`, and `HerdrSessionSnapshotDecoder.ts` under `socket/protocol/`, and flattened shared VS Code configuration/logging files.
- Hardened CLI record validation to reject arrays.

### Tests and criterion mapping

- Replaced deferred catalog/active/controller tests with `SessionsModel.test.ts` and `statusModel.test.ts`; migrated CLI tests from `discover()`/`HerdrSessionDiscovery` to `list()`/`HerdrSessionListResult`; retained socket integration tests.
- Criterion 1: `SessionsModel.ts` aggregate publication and operation surface; issue #11 race/selection behavior covered by model tests and existing socket suite.
- Criterion 2: `SessionsFeature.ts`, `features/sessions/view/`, and `features/sessions/status/`.
- Criterion 3: `PersistentKeyValueStorage` in feature capabilities and direct `workspaceState` injection in `HerdrExtension.ts`.
- Criterion 4: `JsonSocketClient.ts`, `JsonSocketHerdrSessionConnection.ts`, `socket/protocol/`, flattened `infrastructure/vscode/`, and updated directory result contract.
- Criterion 5: source paths now use `features/**/view/**`; generic ESLint rule updates remain delegated to the separate guardrail slice.
- Criterion 6: migrated CLI contracts and added aggregate/status tests; no assertions weaken old behavior.
- Criterion 7: obsolete source layers removed; no DI container, event bus, generic helper, or forwarding feature facade added.

### Checks

- `npm run typecheck` passed.
- `npm run lint` currently reports only the expected old `vscode` import restriction for the new semantic View paths; no `eslint.config.mjs` changes were made in this slice.
- `npm run format:check` passed.
- `npm test` passed: 4 files, 15 tests.
- `npm run build` passed.
- `npm run test:extension` passed after removing stale `dist/` output before the run.
- `git diff --check HEAD` passed.

### Blockers/deviations

- The original path-based `vscode` lint requirement was superseded by user decision: semantic host ownership remains a canonical review rule but is not mechanically path-linted.
- No product or issue #11 behavior deviation is known.

## Parent reconciliation follow-up (2026-09-19)

- Construction cleanup is now exception-safe in `SessionsFeature`, `StatusFeature`, `VsCodeStatusView`, and `VsCodeSessionsView`: partial command registrations, state subscriptions, tree/status resources, and child resources are disposed on every failure path. The unused StatusFeature revision field was removed.
- Command ownership amendment applied: `SessionsFeature` directly owns `herdr.selectSession`/`herdr.refreshSessions`; `StatusFeature` directly owns all status commands. Views only own rendering and host presentation resources and expose no command-registration API.
- Public entries were narrowed: `features/sessions/index.ts` exports only `SessionsFeature`; `status/index.ts` exports only `StatusFeature`; protocol's unused index was removed; CLI/socket child indexes retain only current production composition exports. Tests import implementation files directly.
- `SessionsModel.test.ts` now has 29 tests covering listing success/missing/failure, stale listing, selection precedence/healing, stopped/no-auto-start, explicit start, serialized/failing persistence, stale resolve/bootstrap/snapshot/close, old connection disposal, authoritative connected/incompatible/disconnected states, observer isolation, and initialization/disposal races.
- `test/extension/sessions.test.ts` was restored with namespaced host registration tests covering Feature command routing, workspace-state wiring, disposal, partial command-registration cleanup, initialization failure cleanup, and disposal-before-initialization. `activation.test.ts` retains the global command inventory.
- Follow-up validation before the lint slice: typecheck, unit/integration tests, format check, build, extension-host tests (5 passing), and `git diff --check HEAD` passed.

## Architecture-lint slice (2026-09-19)

- Removed every path-based `vscode` import restriction from `eslint.config.mjs`; no View/Feature allowlist replaced it.
- Preserved boundary dependency direction, public alias/index enforcement, sibling isolation, cycle detection, production-to-test restrictions, TypeScript rules, and Prettier integration.
- Slice validation passed: lint, typecheck, 29 unit/integration tests, and `git diff --check HEAD`; no files were staged.

## Socket structural reconciliation (2026-09-20)

- Extracted `JsonSocketHerdrSessionConnectionFactory.ts` from the logical connection implementation.
- Moved ping/pong and capability metadata decoding into `protocol/HerdrProtocol.ts`; `HerdrSessionSnapshotDecoder.ts` now owns snapshot decoding only.
- A first socket worker timed out after writing a partial patch. The partial state was captured, the failed child was not resumable, and a fresh same-role fallback completed and validated it.

## Final parent validation (2026-09-20)

All repository-defined checks passed on the reconciled worktree:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm test` — 4 files, 29 tests
- `npm run build`
- `npm run test:extension` — 5 passing
- `git diff --check HEAD`
- staged-file check — empty index

## Independent review reconciliation (2026-09-20)

- Independent Standards and Spec reviews found a stale explicit-Start completion race. `SessionsModel` now rejects Start success and failure after a newer selection, catalog/configuration revision, or disposal by checking revision, generation, and selected Session identity.
- Catalog state remains discovery authority. A current Start failure now publishes the explicit active `start-failed` state instead of overloading `catalog.error`; the ready catalog remains usable, Status preserves the visible error and recovery actions, and the selected Session row owns the diagnostic presentation.
- Known Sessions retained by an error catalog remain renderable, and selected incompatible/disconnected rows show available version/protocol metadata without synthesizing missing values.
- Removed the unused `HerdrStatusView` abstraction and updated README/package setting text to describe the current Sessions View and the fallback semantics of `herdr.session`.
- The socket-timeout finding was rejected for this slice: the production `NodeHerdrSocketConnector` already honors cancellation, and additional behavior for a hypothetical non-conforming connector would be speculative.
- Per the implementation-slice workflow, tests and fixtures were not changed during this correction pass; focused regression cases are deferred to the later testing phase.
- Parent revalidation after the root-cause correction passed typecheck, lint, formatting, 29 unit/integration tests, build, 5 Extension Host tests, diff checks, and the empty-index check.
