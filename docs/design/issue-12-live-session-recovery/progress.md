# Issue #12 progress

## Grounding

- Issue #12 and its dependency relationship were read on 2026-09-20.
- Canonical architecture and domain vocabulary were loaded.
- Issue #11's accepted behavior and the completed feature-oriented architecture migration were reviewed.
- Initial worktree was clean: `main...origin/main`, with no staged, unstaged, or untracked files before this task directory was created.
- A bounded read-only repository coverage audit was delegated with `openai-codex/gpt-5.6-luna` at `medium` thinking and completed with file/line evidence.
- Parent issue #9 and completed dependency #11, including their comments and accepted reconciliation contract, were reviewed.

## Current phase

Source implementation, authorized testing, final independent review, post-review correction, and validation are complete.

## Preliminary coverage assessment

Already implemented or substantially present:

- live subscription events trigger serialized/coalesced complete snapshot reconciliation;
- unexpected closure removes connected authority and publishes a failure state;
- reconnect attempts can reuse the existing connection factory and fresh bootstrap contract;
- explicit Retry and configuration changes already initiate fresh activation;
- incompatibility is distinct from transport disconnection and is rendered as failed/red;
- connection generations and disposal suppress stale callbacks.

Not yet implemented:

- stale snapshot retention in disconnected/reconnecting state;
- automatic reconnect scheduling, prescribed backoff, and jitter;
- reconnect attempt/reset state and deterministic clock/randomness seams;
- no-auto-retry compatibility gate as an explicit retry policy;
- deterministic tests for timing, jitter desynchronization, fresh authority on reconnect, and timer disposal;
- mutation gating consumers beyond the Session connection authority itself.

## Coverage audit conclusion

The audit confirms that #12 should extend `SessionsModel` rather than alter the logical socket connection into a reconnecting resource. Existing #11 behavior supplies subscribe-first bootstrap, serialized/coalesced live reconciliation, acknowledged subscription replacement, fresh snapshots, structured incompatibility, disposal, and an immediate explicit Retry entry point. The missing product behavior is retained stale state plus model-owned retry policy, timing, jitter, compatibility suppression, and deterministic tests.

Issue #11’s accepted contract resolves the apparent event-order ambiguity: events remain invalidation signals and may be coalesced; complete snapshots are published serially. #12 must not add per-event patch application or an event payload queue without new measurement evidence and a separately approved architectural amendment.

## Design decisions recorded

- Keep one continuous yellow reconnect presentation across active attempts and timed waits; do not flash red between attempts.
- Explicit Retry cancels the old generation and restarts the full flow from immediate attempt and the beginning of the backoff sequence.
- Retain stale projection for navigation/read-only observation; only connected authority permits mutation/control.
- Use ordinary platform time and randomness in production with Vitest fake timers/system time and `Math.random` mocks in tests; add no runtime abstraction.
- Define every non-trivial state-machine union variant as a named type. The user approved adding this as a prospective canonical architecture rule.
- Extension disposal means normal deactivation/window or Extension Host shutdown cleanup; it never stops Herdr-owned resources.

## Implementation reconciliation

- One `gpt-5.6-luna` high-thinking implementation worker produced the initial source change.
- Parent inspection found stale-projection loss after failed retries, a same-Session Retry regression, an unapproved disconnected compatibility state, and incomplete application of the named-variant rule.
- The original worker was not resumable; a same-role fallback correction worker fixed all four discrepancies.
- Parent inspection found no remaining known source-level architecture deviation.
- Lint, formatting, diff, and empty-index checks pass.
- Typecheck, build, unit tests, and Extension Host tests remain blocked by unchanged tests that still construct/assert the removed `disconnected` state.
- Detailed evidence is in [`implementation-report.md`](implementation-report.md).

## Approval state

- Product behavior: approved.
- Detailed architecture: approved on 2026-09-20.
- Delegated source implementation: authorized and reconciled.
- Test authoring: authorized, delegated, and parent-reconciled.
- Final validation: typecheck, lint, formatting, 49 unit/integration tests, build, 6 Extension Host tests, diff check, and empty-index check pass.
- Final independent review: both Standards and Spec returned `OK with notes`; no P0/P1 or runtime defect was found.
- Authorized post-review correction: README terminology was updated and the fresh-snapshot reconnect assertion now uses a distinct snapshot.
- Post-correction validation: focused 34-test SessionsModel suite, typecheck, lint, formatting, 49 unit/integration tests, build, 6 Extension Host tests, diff check, and empty-index check pass.
