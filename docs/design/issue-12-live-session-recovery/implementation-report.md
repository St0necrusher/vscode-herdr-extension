# Issue #12 implementation report

Status: **source implementation reconciled; testing phase pending authorization**

## Implemented behavior

- `SessionsModel` owns one reconnect flow, one current logical connection attempt, one retry timer, stale projection retention, backoff position, explicit restart, generation safety, and disposal.
- Retryable initial/bootstrap failures continue after the initial attempt with jittered 0.5, 1, 2, 5, 10, and 30 second waits, repeating 30 seconds.
- A post-connected socket loss retains the latest metadata/snapshot as stale and starts a fresh attempt immediately.
- Every retry resolves the selected Herdr Session endpoint again and creates a fresh `HerdrSessionConnection`; connected authority is published only after subscribe-plus-snapshot bootstrap succeeds.
- Failed retries preserve the prior stale projection. A successful bootstrap clears recovery state and resets backoff.
- Explicit Retry and selecting the already-selected reconnecting/incompatible Session cancel the prior generation and restart the full flow immediately.
- Incompatibility retains optional stale context and schedules no automatic retry.
- Session selection, configuration refresh, and disposal cancel the timer/connection and reject late work.
- Status and Sessions Views present one stable yellow reconnecting state with bounded diagnostics and optional next-attempt time; incompatibility remains red.
- No socket/protocol implementation, terminal feature, runtime abstraction, event queue, seeded RNG, or compatibility facade was added.

## Changed source

- `src/features/sessions/capabilities/index.ts`
- `src/features/sessions/SessionsModel.ts`
- `src/features/sessions/status/statusModel.ts`
- `src/features/sessions/status/view/VsCodeStatusView.ts`
- `src/features/sessions/view/VsCodeSessionsView.ts`

The approved prospective named-variant rule was added to `docs/architecture/code-architecture.md`.

## Parent reconciliation

The first implementation pass had four discrepancies. A fallback same-role correction pass was required because the original writer was not resumable. The corrected source now:

1. preserves stale projection through failed reconnect attempts;
2. restores same-Session selection as explicit Retry;
3. removes the unapproved legacy `disconnected` compatibility state; and
4. names the variants of changed non-trivial state-machine unions.

The parent inspected the resulting source and diff against the approved architecture. No unresolved source-level architectural deviation is known.

## Current validation

Passed after reconciliation:

- `npm run lint`
- `npm run format:check`
- `git diff --check HEAD`
- staged-file check (empty index)

Currently blocked by unchanged pre-#12 tests:

- `npm run typecheck` fails because `src/features/sessions/status/statusModel.test.ts` and `test/extension/sessions.test.ts` still construct the removed `disconnected` state.
- `npm test` has obsolete assertions expecting retryable failures to publish `disconnected` rather than the approved `reconnecting` flow.
- `npm run build` and `npm run test:extension` are consequently blocked by the same TypeScript test-contract mismatch.

These are test conflicts caused by the approved behavior change, not a green validation result. Tests were deliberately unchanged during the implementation slice.

## Pending testing phase

After separate authorization, update obsolete tests and add deterministic coverage for:

- immediate stale transition after live disconnect;
- fresh connection/bootstrap on every attempt;
- 0.5/1/2/5/10/30-second sequence and repeated cap;
- ±20% deterministic jitter and desynchronized clients;
- stable stale projection across multiple failures;
- explicit Retry cancellation and sequence restart;
- successful-bootstrap reset;
- incompatibility suppression and manual/configuration recovery;
- Session selection and model disposal cancelling timers/attempts;
- status and Sessions View reconnect presentation.

Final full validation and the single independent two-axis review remain pending until that scope is complete and stable.
