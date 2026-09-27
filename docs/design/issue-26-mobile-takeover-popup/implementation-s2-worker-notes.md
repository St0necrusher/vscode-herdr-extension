# Slice S2 — worker notes

Status: implemented in the Issue #26 integration worktree. No architecture changes made.

## Criteria and implementation

| Criterion | Result and location |
| --- | --- |
| Surface receives the popup-offer capability and tracks the offer with its `AttachedClient` generation. | `src/infrastructure/pane-editors/PaneTerminalSurface.ts`: type-only `TakeoverOffers` / `TakeoverOffer` imports, constructor injection, and private `takeoverOffer` field. |
| D1 eligibility is derived without stored eligibility state. | `PaneTerminalSurface.ts`: pure `isTakeoverEligible()` derives attached + focused visibility + live target + connected projection focused on the selected Pane. |
| Offer/retract follows converged client state. | `converge()` calls `syncTakeoverOffer()` after client reconciliation and rendering. Offers are created only for an eligible current attach; offers for a different client or an ineligible state are retracted and cleared. |
| Confirm yields only for the current eligible attach. | The offer callback rechecks disposal, client identity and D1, then sets `attachIntent = "displaced"` and calls `converge()`. The existing #16 input/focus paths remain responsible for reacquisition. |
| Dispose retracts the offer. | `dispose()` calls `retractTakeoverOffer()`. |
| Host composition and lifecycle are wired. | `src/extension/HerdrExtension.ts` constructs one `TakeoverPopupHost(configuration, registration, logger)`, injects it into every Surface, and disposes it after the Surface manager and before plugin registration. `src/infrastructure/pane-editors/index.ts` exports the host. |

D1 input-path review: focus/visibility changes, projection snapshot changes (including Herdr focus moves), attach completion, and `move()` all reach `converge()`. Disposal explicitly retracts rather than converging. No D1-changing path requiring another synchronization point was found.

## Changed files

- `src/infrastructure/pane-editors/PaneTerminalSurface.ts`
- `src/infrastructure/pane-editors/index.ts`
- `src/extension/HerdrExtension.ts`
- `src/infrastructure/pane-editors/PaneTerminalSurface.test.ts` — constructor-only minimal fake offer provider.
- `test/extension/pane-editors.test.ts` — constructor-only minimal fake offer provider.
- `docs/design/issue-26-mobile-takeover-popup/implementation-s2-worker-notes.md`

The extension test constructor also instantiated the Surface directly, so the required dependency initially broke repository typechecking. The user authorized adding only a minimal fake provider at that existing construction site; no assertions, fixtures, or test behavior were changed.

## Verification

- `npm run typecheck` — passed.
- `npx vitest run src/infrastructure/pane-editors/PaneTerminalSurface.test.ts` — passed: 1 test file, 12 tests.
- `git diff --check` — passed on the final worktree.
- The extension-host test suite was not run; only the requested targeted Surface test was executed.

## Review rounds

### Round 1

Applied the coordinator's simplification review without changing behavior: `isTakeoverEligible()` now takes `PaneTarget` and returns the D1 expression directly; `syncTakeoverOffer()` computes eligibility once and uses the type guard to offer for the current client; confirmation delegates to `yieldToTakeover(client)` for current-fact validation and Yield. No aliases for the current/attached client or duplicate eligibility check remain in the synchronization method.

- `npm run typecheck` — passed.
- `npx vitest run src/infrastructure/pane-editors/PaneTerminalSurface.test.ts` — passed: 1 test file, 12 tests.

## Deviations and open questions

- No behavior or architecture deviations.
- The extra constructor-only edit in `test/extension/pane-editors.test.ts` was authorized to preserve required constructor injection while keeping typechecking green.
- No unresolved questions identified in this slice.
- Concurrent unowned changes appeared during execution in `esbuild.mjs`, `eslint.config.mjs`, `package.json`, `tsconfig.json`, and `herdr-plugin/`; they were not touched. Those entries later disappeared from the status output. The latest status check shows an unowned modification to `docs/design/issue-26-mobile-takeover-popup/implementation-status.md`, which was also left untouched.

## E2E fixes

- Updated `TakeoverPluginRegistration` to match Herdr 0.9.0's `plugin_id` field in `plugin list --json`; `npm run typecheck` and `npm run lint` passed.
- Shortened the Unix socket filename to `herdr-takeover-<16 hex chars>.sock` using `randomBytes(8)` to stay within macOS's Unix socket path limit; typecheck and lint passed.
- Changed popup mirroring to use one short Herdr socket connection per `pane.read`; typecheck, lint, and build passed. The smoke test exited after 14 banner redraws when its stdin closed after 5 seconds; the 5-second pipe was placed directly on the popup because local BSD `script` does not propagate the outer pipe's EOF to its child.
- Added pure word wrapping for the takeover banner and reserved remaining terminal rows for the mirror body; typecheck, lint, build, and 40-column smoke passed with two inverse banner rows containing the complete text across 14 redraws.
- Preserved the reopen attempt number in shown-offer state so `hello` does not reset D11's per-offer retry budget; typecheck and lint passed.
- Disabled DECSET 1004 focus reporting to avoid xterm.js's synthetic focus-in reattaching immediately; only non-wheel SGR mouse presses now trigger local intent. Typecheck, lint, and the targeted Surface test (12 passed) passed.
- Forwarded confirming keyboard input as UTF-8 via a one-shot `pane.send_text` request after stripping focus reports; the popup confirms after a response or socket error. Mouse-containing confirms remain unforwarded. Typecheck, lint, and build passed; smoke confirmed the fake owner received `confirm`, live Pane `w3:p1Y` showed the injected `x`, and a `pane.send_text` Ctrl-U cleared it.

## D13 — reattach on mouse click

`PaneTerminalSurface.ts` derives displaced-observing from the existing attach intent and client. It enables SGR mouse reporting only while that state holds, restores the modes after each `SCREEN_RESET`, and disables them when the state ends; terminal disposal handles its own teardown. Raw displaced-state input is classified before arrow translation: only non-wheel SGR mouse presses reattach without forwarding; focus reports, wheel emulation/events, and releases are ignored; other input retains the existing reattach-and-forward path.

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx vitest run src/infrastructure/pane-editors/PaneTerminalSurface.test.ts` — passed: 1 test file, 12 tests. No tests changed.

### Review round 1

Updated the pure input classifier to match a complete chunk as consecutive mouse, focus, or bare-arrow reports, then classify the whole chunk from its reports; extra bytes stay on the ordinary input path. Simplified `isDisplacedObserving()` to the attach-intent/client predicate and removed terminal mode synchronization during disposal.

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npx vitest run src/infrastructure/pane-editors/PaneTerminalSurface.test.ts` — passed: 1 test file, 12 tests.
