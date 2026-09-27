# Issue #26 — S2 implementation report: Surface integration and host composition

## Assignment

Integrate the takeover offer into `VsCodePaneTerminalSurface` per [`architecture.md`](architecture.md) (D1, D6, D7, D8, Domain model, Data flow steps 2 and 6–8, Retract, Public seams). The Surface:

- receives `TakeoverOffers` in its constructor;
- keeps a private `takeoverOffer: { client: AttachedClient; offer: TakeoverOffer } | undefined`;
- syncs it at the end of `converge()`;
- on confirm, rechecks and then sets `attachIntent = "displaced"` and runs `converge()`;
- retracts in `dispose()`.

The slice also composes `TakeoverPopupHost` in `HerdrExtension` and injects it into every Surface. The slice was moved here from S4, because it needs both the S1 class and the constructor change.

- Worker: `luna-26s2`, pi `openai-codex/gpt-6-luna` (max thinking), Herdr pane `w3:p1X`, working directly in the integration worktree.
- Reviewer and integrator: `opus-impl26`.

## Files changed

- `src/infrastructure/pane-editors/PaneTerminalSurface.ts`:
  - a pure `isTakeoverEligible()` (D1: attached ∧ focused ∧ live target ∧ connected projection with `focusedPaneId` equal to the selected Pane);
  - `syncTakeoverOffer()`, called at the end of `converge()`;
  - `yieldToTakeover(client)`;
  - `retractTakeoverOffer()`, also called from `dispose()`.
- `src/infrastructure/pane-editors/takeover/index.ts` (new, orchestrator): the child entry of `takeover/`. It exports `TakeoverPluginRegistration`, `TakeoverPopupHost`, `TakeoverOffers` and `TakeoverOffer`. The repository boundary rules let a parent import only the child's `index.ts`.
- `src/infrastructure/pane-editors/index.ts`: exports `TakeoverPluginRegistration` and `TakeoverPopupHost` from `./takeover`. `TAKEOVER_PLUGIN_ID` is no longer exported, because no consumer outside `takeover/` needs it.
- `src/extension/HerdrExtension.ts`:
  - constructs `TakeoverPopupHost(configuration, registration, logger)` and injects it into each Surface;
  - disposes it after the Surface manager and before the Registration.
- `src/infrastructure/pane-editors/PaneTerminalSurface.test.ts` and `test/extension/pane-editors.test.ts`: constructor-only fake `{ offer: () => ({ retract: () => undefined }) }`. Nothing else changes in the tests.

## D1 input paths

The worker confirmed that each D1 fact reaches `converge()`, so one sync point at the end of `converge()` is enough:

- visibility through the focus subscription;
- Herdr focus through projection snapshots;
- attach exit through `handleAttachCompletion`;
- `move()`.

`dispose()` retracts explicitly.

## Review rounds

1. **Worker question.** The worker opened an interactive `ask_user_question` about the second constructor site in `test/extension/pane-editors.test.ts`. The orchestrator answered: the same minimal fake is allowed there. A pi dialog reports the agent as `working`, so `herdr agent wait` never returned `blocked`. The owner noticed the stall. Later briefs forbid interactive questions.
2. **Round 1.** Simplified the sync:
   - D1 is now one boolean expression typed with `PaneTarget`;
   - eligibility is computed once, without client aliases or a second eligibility call;
   - the confirm body moved into `yieldToTakeover(client)`.

   Accepted.
3. **Final-check fixes by the orchestrator.** These are mechanical:
   - added `takeover/index.ts` for the boundaries rule;
   - fixed lint findings in the S1/S4 files:
     - optional chains;
     - `const` state with an inline hello timer;
     - an async `listen()` with no rejection of a non-`Error`;
     - no non-null assertion (the missing reopen delay is the give-up signal);
     - an `interface` for the plugin-list response;
     - `retract: () => undefined`;
   - ran Prettier.

   Behaviour is unchanged.

## Deviations

- `takeover/index.ts` is not in the expected file structure. The repository's child-entry rule requires it, and it changes no boundary.

## Checks

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` and `npm test` (9 files, 73 tests) all passed. See [`implementation-status.md`](implementation-status.md).

## Commit

See [`implementation-status.md`](implementation-status.md).
