# Testing assignment — issue #12 reconnect behavior

## Authority

The user authorized this separate testing phase on 2026-09-20. Read `AGENTS.md`, `docs/architecture/code-architecture.md`, `CONTEXT.md`, the approved [`architecture.md`](architecture.md), and [`implementation-report.md`](implementation-report.md).

Production source and all design/architecture/task-control documents are read-only. If a required behavior is not reachable or source behavior contradicts the approved architecture, report the concrete trace to the coordinator instead of changing production code.

## Owned test files

- `src/features/sessions/SessionsModel.test.ts`
- `src/features/sessions/status/statusModel.test.ts`
- `test/extension/sessions.test.ts`

Change another test/helper file only when a concrete current test seam requires it, and report why. Do not change production source, build configuration, fixtures unrelated to this behavior, snapshots, or package scripts.

## Required coverage

Update obsolete `disconnected` expectations to the approved `reconnecting` contract and add stable behavioral coverage for:

1. retryable initial/bootstrap failure enters reconnect recovery without retaining a nonexistent snapshot;
2. live disconnect atomically retains the latest snapshot/metadata as stale and begins an immediate fresh attempt;
3. every retry resolves the endpoint again and creates a fresh logical connection;
4. base waits follow 0.5, 1, 2, 5, 10, and 30 seconds, then repeat 30 seconds;
5. deterministic `Math.random` values prove ±20% bounds and two model instances can receive different scheduled times rather than synchronize;
6. failed retries preserve the prior stale projection;
7. successful bootstrap publishes fresh authority and resets the backoff sequence;
8. explicit Retry cancels/disposes the current attempt or timer, restarts immediately, and resets the sequence;
9. selecting the already-selected reconnecting/incompatible Herdr Session has the same explicit-restart behavior;
10. incompatibility retains optional stale projection, schedules no automatic retry, and can recover through explicit Retry or configuration change;
11. Session selection, configuration refresh, and model disposal cancel timers/attempts and suppress late callbacks;
12. status and Sessions View present reconnecting with stale metadata and waiting/attempting details without a disconnected flash.

Use Vitest fake timers/system time and deterministic `Math.random` mocks. Do not use real sleeps. Test observable state, operations, disposal records, and public View behavior; do not inspect private fields.

Prefer a small harness extension over duplicate setup. Keep tests deterministic and restore timers/mocks after each applicable test.

## Exclusions

- No tests for future Spaces, Panes, Agents, terminal observation/control, or mutation consumers.
- No new production seams solely for tests.
- No private-field assertions, wall-clock sleeps, snapshot files, compatibility facade, unrelated cleanup, staging, commit, push, or GitHub mutation.

## Validation

Run and record:

- focused Sessions model/status tests;
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run build`
- `npm run test:extension`
- `git diff --check HEAD`
- empty staged-file check

## Durable result

Return a concise report mapping each required behavior to test names/files, all command outcomes, any production defect discovered, and residual gaps. The parent will record the durable synthesis.
