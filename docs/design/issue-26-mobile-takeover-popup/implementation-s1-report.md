# Issue #26 — S1 implementation report: `TakeoverPopupHost`

## Assignment

Implement `src/infrastructure/pane-editors/takeover/TakeoverPopupHost.ts` per [`architecture.md`](architecture.md) (Modules, Data flow, Failures, Public seams, D5, D11). Scope:

- the `TakeoverOffers` and `TakeoverOffer` seams;
- one current offer at a time;
- a lazy owner Unix socket (`0600`, random path in `os.tmpdir()`) and a per-offer token;
- the `hello`/`alive`/`retract`/`confirm` protocol;
- launch through `herdr [--session S] plugin pane open --plugin <id> --entrypoint takeover --env …`;
- D11 maintain/reopen;
- dispose.

The host depends on the Registration only through a narrow local interface.

- Worker: `luna-26s1`, pi `openai-codex/gpt-6-luna` (max thinking), Herdr pane `w3:p1T`, worktree `/private/tmp/vscode-herdr-issue26-s1` (branch `issue26-s1`).
- Reviewer and integrator: `opus-impl26`.

## Files changed

- New: `src/infrastructure/pane-editors/takeover/TakeoverPopupHost.ts`. Not exported from `index.ts` yet; composition is S2.

## Behaviour

- State is `opening | shown | waiting-to-reopen`, or `undefined` for no current offer. Every async callback checks `this.state === <its state object>`.
- `offer()`:
  - retracts the current offer, if any;
  - returns an inert offer when the plugin is not registered;
  - otherwise starts attempt 1.

  `retract()` affects only its own offer and is idempotent.
- Opening:
  - starts a 5 s `hello` deadline;
  - lazily starts the owner socket (one memoized promise; `chmod 0600` before the first launch);
  - runs `execFile` of the Herdr CLI.

  A CLI failure whose output contains `"code":"plugin_not_found"` ends the offer with one info log line and no retry. Any other failure goes through D11.
- `hello <current token>` → `shown`, with `alive` every 1 s and the backoff reset. A newer `hello` with the same token replaces the shown connection and retracts the older one; a late popup from a timed-out attempt can do this. An unknown token gets `retract` and the connection is closed.
- `confirm` from the shown connection clears the state and closes the connection, then calls `onConfirm()` synchronously. Any other `confirm` destroys the connection.
- The shown connection closing without `confirm` or `retract` triggers a reopen. Reopen delays are 1, 2, 4 and 8 s, then the host gives up for that offer (error log).
- `dispose()` (idempotent): retracts the offer, closes the server and removes the socket path.

## Review rounds

1. Round 1 kept the behaviour and removed defensive machinery:
   - replaced the server start/reset/close state (listening flag, "closed before listening", chmod-failure rollback, `closeWhenListening`) with one memoized listen promise;
   - dropped the connection set and the post-dispose guards (Surfaces are disposed before the host);
   - replaced the attempt object and triple comparisons with state-object identity;
   - dropped the redundant currency checks in timers that are cancelled anyway;
   - launched with `execFile` instead of `spawn` plus manual buffering;
   - detected `plugin_not_found` with a text check instead of a JSON validation ladder.

   Accepted after round 1.
2. Integration (orchestrator): `TAKEOVER_PLUGIN_ID` is imported from `TakeoverPluginRegistration.ts` (one owner of the id). The local narrow interface is renamed `TakeoverPluginRegistrationState` to avoid shadowing the class name.

## Deviations

- The removed-plugin case is logged with `logger.info`, because `HerdrLogger` has no warning level. The architecture says "warning".
- A failed owner-socket listen stays cached, so every later attempt fails through D11 until reload. The owner does not treat this as a realistic case (fresh random path).
- `--no-focus` is not passed: the spike saw no difference and the manifest owns the popup placement.

## CLI evidence

- `herdr plugin pane open --help` (0.9.0) accepts `--plugin`, `--entrypoint`, a repeatable `--env KEY=VALUE` and `--no-focus`. `--placement` has no `popup` value, so none is passed.
- `herdr plugin pane open --plugin does.not.exist --entrypoint x` exits with code 1 and prints `{"error":{"code":"plugin_not_found","message":"plugin not found"},"id":"cli:plugin"}`.

## Checks

`npm run typecheck` passed in the worker worktree and after integration.

## Commit

See [`implementation-status.md`](implementation-status.md).
