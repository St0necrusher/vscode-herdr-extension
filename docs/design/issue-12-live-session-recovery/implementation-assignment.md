# Implementation assignment — issue #12 reconnect slice

## Authority

The approved design is [`architecture.md`](architecture.md), approved by the user on 2026-09-20. Follow `AGENTS.md`, `docs/architecture/code-architecture.md`, `CONTEXT.md`, and `.agents/skills/implement-slice/SKILL.md`.

The worker owns implementation only. Do not edit `architecture.md`, `progress.md`, `implementation-assignment.md`, or other design/architecture documents. If source evidence contradicts the design, pause the affected work and report the contradiction to the coordinator.

## Owned source files

- `src/features/sessions/capabilities/index.ts`
- `src/features/sessions/SessionsModel.ts`
- `src/features/sessions/status/statusModel.ts`
- `src/features/sessions/status/view/VsCodeStatusView.ts`
- `src/features/sessions/view/VsCodeSessionsView.ts`
- `src/features/sessions/SessionsFeature.ts` only if required by the approved design; the current design expects no timing abstraction or additional dependency.

Other production files may be changed only when an unavoidable compile dependency is demonstrated and recorded. Do not change socket implementation or protocol decoders without coordinator approval.

## Required behavior

- Keep `SessionsModel` as the sole reconnect/projection authority.
- Define every `ActiveSessionState` variant as a named type; compose the aggregate union from those names.
- Retain the last connected snapshot and metadata as optional stale projection during reconnect or incompatibility.
- Only `connected` grants current mutation/control authority.
- On retryable initial-bootstrap or post-connect failure, start one continuous reconnect flow: immediate attempt, then jittered base delays 0.5, 1, 2, 5, 10, 30 seconds, repeating 30 seconds.
- Use `baseDelay * (0.8 + Math.random() * 0.4)` for positive delays. Use ordinary platform timers/time/randomness; add no runtime abstraction.
- Each retry resolves the selected Session endpoint again, creates a new logical connection, and requires fresh subscribe-plus-snapshot bootstrap before publishing connected.
- Keep one stable `reconnecting` state across attempting and waiting phases. Do not alternate disconnected/reconnecting in presentation.
- Explicit Retry disposes/invalidates the current attempt, cancels its timer, resets the sequence, and starts a new immediate flow. Attempts never overlap; stale uncancellable work is rejected by generation.
- Successful bootstrap resets recovery state and backoff.
- Incompatibility retains optional stale context, is red, schedules no automatic retry, and resumes only after explicit Retry or configuration change.
- Selection change, configuration refresh, and disposal cancel timer/attempt and reject late callbacks.
- Status and Sessions View show reconnecting consistently with bounded diagnostics and next-attempt timing where available.

## Exclusions

- No Spaces/Panes/Agents Views or terminal behavior.
- No test, fixture, snapshot, helper, or test-configuration changes.
- No reconnect service, event queue/reducer, state store, clock/random abstraction, seeded RNG, client identity, compatibility facade, or unrelated cleanup.
- No staging, commit, push, or issue mutation.

## Existing worktree

Before implementation, the parent changed only task documentation and the canonical named-union architecture rule. Preserve these changes. The implementation worker is the sole source writer in the shared worktree.

## Validation

Run and record:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm test` (do not change tests; classify expected old-contract conflicts)
- `npm run build`
- `git diff --check HEAD`
- confirm no staged files

Run `npm run test:extension` if existing source behavior remains compatible enough; otherwise record the exact test-contract blocker. Do not weaken or update tests.

## Durable result

Write the final implementation report to `docs/design/issue-12-live-session-recovery/implementation-report.md`. Include criterion-to-location mapping, changed files/public seams, command outcomes, test conflicts, deviations, residual risks, and unresolved questions. The report is implementation evidence, not architecture authority.
