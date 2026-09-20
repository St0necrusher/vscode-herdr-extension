# Issue #12 — live Session projection and connection recovery

Status: **approved for implementation on 2026-09-20**

Issue: [#12 — Keep the Session projection live and recover connections](https://github.com/St0necrusher/vscode-herdr-extension/issues/12)

Parent: #9

Blocked by: #11 (closed)

## Purpose

Extend the existing Sessions-owned connection lifecycle so the active Herdr Session projection remains useful and safe across live events, socket loss, server restart, and protocol incompatibility.

## Acceptance criteria

- Live lifecycle events update the active Session projection in server order after bootstrap.
- Disconnect immediately marks the existing projection stale and disables mutating actions without clearing visible context.
- Automatic reconnect attempts run immediately, then after 0.5, 1, 2, 5, 10, and 30 seconds, then every 30 seconds, with ±20% jitter.
- Explicit Retry attempts immediately; a successful fresh bootstrap resets backoff.
- Every reconnect establishes new authority through a fresh subscribe-plus-snapshot bootstrap before mutations are enabled.
- Deterministic jitter tests show that concurrent VS Code clients do not synchronize reconnect attempts.
- Protocol incompatibility is presented as red/incompatible, disables terminal creation/mutation/control, and suppresses automatic retry until configuration changes or explicit Retry.
- Fake-clock and deterministic-random tests cover stale transitions, backoff bounds, fresh snapshots, compatibility gating, and disposal.

## Exclusions

To be confirmed with the user during design. The current issue does not itself require new Spaces/Panes Views, terminal creation/control implementation, notifications, or unrelated protocol and architecture cleanup.

## Existing foundation from #11

The current implementation already provides:

- `SessionsModel` as the authoritative owner of catalog and active Session state;
- subscribe-first bootstrap and complete snapshot replacement behind `HerdrSessionConnection`;
- live event invalidation with serialized/coalesced fresh snapshots;
- acknowledged subscription replacement followed by a stabilizing snapshot when the Pane set changes;
- structured transport versus incompatibility failures;
- immediate transition away from connected authority after unexpected closure;
- explicit Retry and configuration-change recovery entry points;
- generation/disposal guards against stale connection callbacks; and
- red failed status presentation for incompatible/disconnected states.

Issue #12 must extend these mechanisms rather than add a peer reconnect service or another projection owner.

The canonical #11 contract intentionally treats events as invalidation signals, coalesces nearby invalidations, and does not apply event payloads as patches. For #12, “server order” therefore means that received invalidations are processed through one serialized reconciliation pipeline and complete authoritative snapshots are published in reconciliation order; it does not mean one projection publication per server event. This preserves #11’s explicit prohibition on an event queue or incremental reducer without measurement evidence.

## Ownership and data flow

- `SessionsModel` remains the sole owner of connection authority, retained projection state, reconnect attempt state, retry policy, and retry timer lifecycle.
- Each `HerdrSessionConnection` remains one disposable logical attempt. It owns only ping, subscribe, snapshot reconciliation, transport resources, and attempt-local failures.
- Every automatic or explicit retry constructs a new logical connection and reaches `connected` only after that connection completes a fresh subscribe-plus-snapshot bootstrap.
- Consumers determine whether mutation is allowed from aggregate active authority; a stale projection is readable but never authoritative for mutation.
- Production policy uses ordinary `setTimeout`, `clearTimeout`, `Date.now`, and `Math.random`. Tests use Vitest fake timers/system time and a deterministic `Math.random` mock. No clock, scheduler, seeded-random, or reconnect-runtime abstraction is introduced.

## Active state contracts

Every `ActiveSessionState` variant is a separately named type, following the canonical state-machine rule. The aggregate union only composes those names.

The existing initial-selection states remain. The recovery-related variants are conceptually:

```ts
type StaleSessionProjection = Readonly<{
  metadata: HerdrSessionMetadata;
  snapshot: HerdrSessionSnapshot;
}>;

type ReconnectPhase =
  | Readonly<{ kind: "attempting" }>
  | Readonly<{ kind: "waiting"; retryAt: number }>;

type ReconnectingActiveSessionState = Readonly<{
  kind: "reconnecting";
  session: HerdrSessionDescriptor;
  endpoint?: string;
  staleProjection?: StaleSessionProjection;
  failure: Exclude<HerdrConnectionFailure, { kind: "incompatible" }>;
  phase: ReconnectPhase;
}>;

type IncompatibleActiveSessionState = Readonly<{
  kind: "incompatible";
  session: HerdrSessionDescriptor;
  endpoint?: string;
  staleProjection?: StaleSessionProjection;
  failure: Extract<HerdrConnectionFailure, { kind: "incompatible" }>;
}>;
```

`staleProjection` is absent when initial connection fails before any authoritative snapshot exists. Only `ConnectedActiveSessionState` grants mutation/control authority. `reconnecting` stays yellow during both attempting and waiting phases; waiting details may expose the last failure and `retryAt` without changing the primary status.

## Retry lifecycle

A retryable initial-bootstrap or post-connect failure enters one reconnect flow. The flow attempts immediately, then schedules positive base delays of 0.5, 1, 2, 5, 10, and 30 seconds, repeating 30 seconds. Each positive delay is `baseDelay * (0.8 + Math.random() * 0.4)`.

Each attempt resolves the selected Session endpoint again, creates a fresh logical connection, and completes subscribe-plus-snapshot bootstrap before publishing `connected`. A successful bootstrap clears retained stale context, resets the sequence, and cancels any timer.

Explicit Retry invalidates the current generation, disposes the current connection, cancels the pending timer, resets the sequence, and starts a new flow immediately. Results from uncancellable stale resolution promises are rejected by the existing generation rule. Attempts never overlap.

An incompatible failure cancels recovery and publishes `incompatible`; only explicit Retry or configuration change starts a new attempt. Session selection, configuration refresh, and disposal cancel the current connection and timer before invalidating their generation. Normal extension disposal never mutates Herdr-owned resources.

## Presentation and future consumers

The Status View and Sessions View render one stable `reconnecting` state rather than alternating reconnecting/disconnected between attempts. Connected is green, reconnecting is yellow, and incompatible is red.

Issue #12 adds no Spaces, Panes, or terminal implementation. Its state contract allows later consumers to keep stale navigation readable and to open/focus an existing Pane through a read-only observer attachment. They must permit creation, mutation, input, and terminal control only while Sessions authority is `connected`. No repository-level mutation-gate capability is added until a current independent consumer exists.

## Agreed reconnect behavior

The user approved the following behavior on 2026-09-20:

1. A retryable connection failure atomically retains the last snapshot as stale, disables mutation/control authority, and enters one continuous reconnect flow.
2. The reconnect flow stays visibly `reconnecting` while both attempting and waiting. It does not alternate red/yellow between failed attempts. The UI may show the last failure and next-attempt timing in details without changing the main yellow reconnect status.
3. One flow attempts immediately, then waits on the base sequence 0.5, 1, 2, 5, 10, and 30 seconds, repeating 30 seconds thereafter.
4. Each positive delay receives the minimal jitter formula `baseDelay * (0.8 + random * 0.4)`. Randomness is injected per model instance; no client-identity subsystem is added.
5. Explicit Retry cancels the current attempt or pending timer, invalidates its generation, and starts a new reconnect flow immediately from the beginning of the backoff sequence. Attempts never overlap.
6. A successful fresh bootstrap also resets the sequence.
7. Incompatibility retains stale context, appears red, schedules no automatic retry, and can be retried only by explicit Retry or configuration change.
8. Selecting another Herdr Session cancels the old attempt/timer and does not transfer its stale snapshot.
9. Normal extension disposal means deactivation during window reload/close, disabling/uninstalling the extension, or extension-host shutdown. It cancels extension-owned timers and connections but never stops Herdr-owned Sessions, Panes, PTYs, processes, or Agents. On process crash, the OS closes process-local resources.

The user also accepted the future-facing safety contract: stale Spaces and Panes remain navigable, an existing Pane may be opened or focused through a read-only observer attachment, and creation/mutation/terminal control remain unavailable until a fresh authoritative snapshot is installed. Issue #12 establishes the authority state; later feature tickets consume it.

## Expected source changes

- `src/features/sessions/capabilities/index.ts`: named state variants, stale projection, reconnect phase, and aggregate unions.
- `src/features/sessions/SessionsModel.ts`: retain stale projection; own one timer and one attempt; implement immediate retry, backoff, jitter, explicit restart, incompatibility suppression, generation safety, and disposal.
- `src/features/sessions/status/statusModel.ts` and `status/view/VsCodeStatusView.ts`: stable yellow reconnect presentation and bounded details.
- `src/features/sessions/view/VsCodeSessionsView.ts`: reconnecting Session row and stale diagnostics.
- Existing model, status, and Extension Host tests: later separately authorized test work for timing, stale state, jitter, Retry, incompatibility, and disposal.
- `JsonSocketHerdrSessionConnection` and protocol decoders are expected to remain unchanged.

## Implementation slices

After explicit authorization, use one bounded implementation worker because the model, feature-local state contracts, and both Views share the same state seam and should not be changed by concurrent writers. The worker must follow the companion `implement-slice` skill, must not edit this task directory, and must report any contradiction rather than changing the approved architecture. Parent reconciliation follows before validation and the separately authorized testing phase.

## Approval

The user approved this architecture and authorized delegated implementation on 2026-09-20. Architecture artifacts remain parent-owned; implementation workers may read them but must not edit them.
