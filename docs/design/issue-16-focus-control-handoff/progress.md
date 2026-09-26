# Issue #16 progress

Status: implemented and refactored per [`simplification-audit.md`](simplification-audit.md). The final design is in [`architecture.md`](architecture.md). See "Final state". The "Current checkpoint" log below is the historical record of the original implementation.

## Current checkpoint

- Read issue #16 and related #9, #14, #26, #27, and #28 requirements.
- Read the canonical code architecture, domain vocabulary, issue-tracker guidance, and test-scenario planning guidance.
- Confirmed the main worktree started clean at `a302018` and contains only the completed #14 read-only terminal surface implementation.
- Audited the direct-attach prototype at committed revision `655c1a9` and its current dirty multi-group visibility changes.
- Delegated primary-source Herdr 0.9.0 and `node-pty` research to `openai-codex/gpt-6-luna` with `xhigh` thinking.
- Verified from pinned Herdr v0.9.0 sources that `pane.moved` carries the previous Pane identity and full new Pane record.
- Agreed the bounded `PaneEditorSelectionModel` responsibility, API, event contract, and event-provider dependency in [`architecture.md`](architecture.md).
- Agreed that Selection is the authority for desired active Pane tabs; `PaneTerminalSurfaceManager` reconciles actual editors, while infrastructure-owned `PaneEditorFocusTracker` combines Selection with whole-window focus.
- Agreed that the focus tracker publishes reusable facts to multiple consumers: #16 terminal surfaces now and #26 popup-offer policy later; it owns neither attach nor popup lifecycle.
- Resolved implementation-time lifecycle question: compose FocusTracker immediately after Selection and before any Selection producer/restoration, so event-only Selection remains sufficient without adding a state getter.
- Confirmed that manager move handling relies on Herdr's valid unique destination identity and must not grow defensive policy for an impossible destination collision.
- Agreed that window blur does not mutate Selection and that manual tab changes are normalized back through Selection.
- Completed and parent-reviewed the isolated Selection/event-delivery slice; normalized `pane.moved` now reaches `PaneEditorSelectionModel` without changing existing snapshot reconciliation.
- Completed and parent-reviewed infrastructure-owned `PaneEditorFocusTracker` with callback sets grouped by Pane identity, immediate current state, and deduplicated transitions. The later concrete-Surface design extends its current `{ focused: boolean }` event to a boolean/reason discriminated union: `window-focused`, `editor-hidden`, or `window-blurred`. This lets Surface distinguish hidden from visible-but-blurred without a separate Selection subscription.
- Corrected move responsibility: the tracker atomically updates Selection membership on `pane.moved` but does not migrate, dispose, or notify existing per-Pane subscriptions; each consumer owns disposing the old binding and subscribing to the new identity.
- Approved independent move-event fan-out: `PaneTerminalSurfaceManager` and every future concrete Surface subscribe directly to the same normalized `HerdrSessionEventSource`; each owns its own state.
- Completed the manager correction: it listens to Selection only for selected creation/reveal and to `pane.moved` for its registry key, including retained deselected surfaces. It does not call Surface for identity or focus changes and has no FocusTracker dependency.
- At the manager-stub checkpoint, the handle seam contained only `reveal()` and `dispose()`. The later concrete Surface slice added neutral `showPaneName()` so the manager can signal successful temporary-name correlation without exposing Tab binding to the Surface. Each concrete Surface owns identity updates, focus rebinding, and observe/attach intent.
- Agreed the initial single-Pane placement policy: an editor already active in any group is a no-op; an existing inactive editor activates in its current group; a missing editor is created in the current active group. Existing editors are not moved, other groups remain unchanged, and multi-Pane Herdr Tab clicks are deferred.
- Committed the agreed implementation and design checkpoint (`feat: add Pane editor selection infrastructure`).
- Resolved VS Code Tab correlation: create the terminal with the temporary exact name `${sessionId}:${paneId}`, find the enclosing `vscode.Tab` whose input is `TabInputTerminal` and whose label matches, then keep `vscode.Tab` object identity. Do not add speculative pre-existence, multiplicity, collision, or recovery checks; an absent match remains unbound until a later tab reconciliation.
- Agreed that a future concrete Surface will replace the temporary name with its current user-facing Pane name through `Pseudoterminal.onDidChangeName` after binding. User-facing names are not correlation keys because they are optional, mutable, and non-unique.
- Implemented and parent-reviewed the bounded Manager placement/Tab-binding slice: captured active `viewColumn`, exact temporary-name binding, retained `vscode.Tab` object identity, all-group active-tab normalization, create/reveal/no-op policy, and disposal of the extension-owned Surface when its bound VS Code terminal editor tab closes. Server-owned Herdr Panes remain alive. Existing #14 composition, concrete Surface, observe/attach, real PTY/CLI control, persistence, multi-Pane Herdr Tab behavior, and tests remain unchanged.
- Committed that placement/Tab-binding slice (`feat: reconcile Pane editors with VS Code tabs`).
- Agreed the concrete Surface direction: separate observer and direct-attach process objects coordinated by the Surface; direct output sink rather than output subscriptions; native PTY input buffering without a Surface buffer or first-output gate; independent `SIGTERM`→bounded `SIGKILL` cleanup with observer/attach overlap but never two attaches; no `Ctrl+B q` cleanup.
- Agreed resource policy by visibility: a Pane editor hidden behind another VS Code tab runs neither client, a visible editor in a blurred VS Code window observes, and a visible focused editor attaches unless explicit Yield or displacement suppressed reacquisition. `group.isActive` remains irrelevant.
- Confirmed from the existing Herdr v0.9.0 source audit that live cross-Space `pane.moved` preserves `terminal_id`; restored Sessions receive fresh terminal IDs.
- Replaced the provisional one-shot `pane get` design with the existing `ActiveSessionProjectionSource`: only Panes belonging to the connected active Herdr Session may run observer/attach clients. Editors from another Session, stale/unavailable projection, or a missing Pane stop both clients and show a suspended placeholder while preserving Selection and the VS Code editor. Returning to the Session supplies the authoritative current `terminal_id`, including a replacement ID after Herdr Session restoration, without extra CLI requests or Session connections.
- Agreed placeholder presentation for inactive, reconnecting, incompatible, and missing-Pane states; live resumption clears the visible placeholder without altering the server-owned Pane.
- Agreed the post-binding VS Code tab name: plain `pane.label / pane.terminalTitleStripped`, with raw terminal-title and `Pane <paneId>` fallbacks, omitted separators for missing parts, and duplicate-part suppression. VS Code cannot color one title segment separately.
- Agreed prototype-equivalent resize: immediate `node-pty.resize` for attach; 120 ms debounced observer replacement without awaiting old observer exit; hidden/suspended surfaces only store dimensions.
- Agreed to enrich normalized `pane.moved` with the complete current `HerdrPane` already supplied by Herdr. Surface updates identity, Pane data, name, and focus binding immediately and does not wait for a replacement snapshot or restart a valid client.
- Agreed failure UX: observer failure uses an editor placeholder and logs; focus-only attach failure silently returns to observation; a local-input-triggered failure warns at most once and only if the original identity, target, active Session, visibility, focus, and attach intent still hold, so rapid tab switches never produce delayed notifications; unexpected attach exit remains silent.
- Agreed minimal process contracts: direct terminal-output sink, ordinary `createObserver`/`createAttach`, one completion Promise, idempotent Promise-returning `stop`, attach-only `sendInput`/`resize`, no output subscriptions, duplicate `dispose`, or common base class. Cleanup retains prototype timeouts: observer 500/250 ms and attach 1000/350 ms for `SIGTERM`/`SIGKILL` waits.
- Corrected the exact direct-attach dependency to prototype-validated `node-pty@1.2.0-beta.13`: published `1.1.0` has a non-executable macOS arm64 spawn-helper after ordinary install. It remains externalized as a native dependency; the packaged static `resources/herdr-direct-attach.toml` remains `[ui] mouse_capture = false`. Composition resolves and injects its path into the client factory; Surface requests do not know it, and no runtime config file or user-config mutation is used.
- Committed runtime prerequisites (`build: add direct attach runtime assets`), the standalone read-only observer (`feat: add read-only Pane observer resource`), and the standalone direct attach (`feat: add direct Pane attach resource`).
- Committed concrete Surface presentation scaffolding and the Herdr Pane client factory (`feat: scaffold Pane terminal surface`). The Surface creates the Pseudoterminal, preserves the temporary correlation name until `showPaneName()`, derives Pane names and suspended placeholders from active-Session projection, and still starts no observer or attach.
- Committed the Surface-context slice and audit corrections (`feat: track Pane surface context`): the Surface independently consumes `pane.moved`, rebinds its FocusTracker subscription, records the current focus condition and dimensions, and tolerates the agreed old-identity projection interval. It remains uncomposed and starts no process. The same checkpoint corrected stale direct-input documentation and synchronous traversal style.
- Confirmed the production visibility and initial-dimensions policies: a hidden Pane editor runs neither observer nor attach, and a Surface whose `Pseudoterminal.open` receives no dimensions waits for the first real `setDimensions` event before creating either client. No prototype `120×40` fallback, timer, or extra readiness state is added; ordinary reconciliation starts immediately when real dimensions are available.
- Committed that architecture decision (`docs: decide initial Pane dimensions policy`).
- Implemented and parent-reconciled the observer-only Surface lifecycle: observer creation is gated by Pseudoterminal open, real dimensions, visibility, and the connected active-Session Pane target; hidden/suspended/changed targets stop or replace without awaiting cleanup; unchanged move targets are retained; stale output/completion is rejected by resource identity; failure produces an observer-specific placeholder without a retry loop; and resize replacement uses the latest dimensions after the agreed 120 ms debounce. Existing checks pass and tests remain unchanged. See [`implementation-observer-surface-report.md`](implementation-observer-surface-report.md).
- Committed the observer-only lifecycle (`feat: add Pane observer lifecycle`).
- Implemented and parent-reconciled direct-attach Surface orchestration: focused eligible Panes attach through the existing PTY resource; triggering input is written directly after synchronous creation; blur/hidden/suspension and suppressed intent select observer or no client as designed; observer/attach cleanup overlaps while later attaches wait for the retained stopping attach; unexpected exit clears intent without fight-back; resize is immediate; and input-triggered creation warnings are revalidated against the complete current eligibility context. See [`implementation-attach-surface-report.md`](implementation-attach-surface-report.md).
- Committed the direct-attach Surface lifecycle (`feat: add Pane direct attach lifecycle`).
- Implemented the production composition replacement in the current worktree: `HerdrExtension` constructs Selection → immediate FocusTracker → Pane client and Surface manager/factory → Navigation; `PaneTerminalSurfaceManager` provides the existing `PaneTerminalOpening` capability; the packaged direct-attach TOML path is injected through `HerdrPaneClientFactory`; and disposal follows reverse ownership order. The old #14 source remains for unchanged direct-import tests but is no longer wired into production. See [`implementation-composition-report.md`](implementation-composition-report.md).
- Completed independent composition review and corrected both actionable findings: every explicit open intent restores idempotent Selection before an active-tab no-op, and Manager, FocusTracker, and Surface constructors roll back resources acquired before a later constructor step fails. The non-blocking Navigation teardown question had no evidence of a callback during disposal.

## Durable inputs

- Requirements: [GitHub issue #16](https://github.com/St0necrusher/vscode-herdr-extension/issues/16)
- Architecture authority: [`../../architecture/code-architecture.md`](../../architecture/code-architecture.md)
- Existing baseline: [`../issue-14-read-only-terminal-editor/architecture.md`](../issue-14-read-only-terminal-editor/architecture.md)
- Prototype and source findings: [`research.md`](research.md)
- Draft design record: [`architecture.md`](architecture.md)

## Refactoring checkpoint (2026-09-26)

The accepted plan in [`simplification-audit.md`](simplification-audit.md) was executed slice by slice. A delegate implements each slice; the coordinating session reviews it, runs `npm run typecheck`, and commits. The per-slice commits were squashed before pushing.

| Slice | Content |
|---|---|
| S1 | Removed constructor rollbacks, host-close tracking, unreachable disposal guards, duplicate stop error handling |
| S2 | Shared `stopWithEscalation`; observer completion always resolves |
| S3 | Manager is the only `pane.moved` handler and the only Selection writer; Selection has `move` and no Session dependency |
| S4 | `AttachIntent = wanted \| displaced \| failed` replaces failure/warning contexts |
| S5 | `PaneClientState` union, pure `desiredClient` (`paneClientPolicy.ts`), synchronous `converge()`; `stoppingAttach` is the only promise field |
| S6 | Pure `paneTarget.ts` (target, name, placeholders); one `movedPane` field |
| S8 (code) | Removed the unreachable #14 terminal-surface path and its tests; live Pane command test kept as `test/extension/pane-command.test.ts` |
| S7 spike | [`s7-arrow-spike-findings.md`](s7-arrow-spike-findings.md): ↑/↓ via `sendSequence` + marker works; the right-button filter was dropped |
| S7 | ↑/↓ keybindings send markers via `sendSequence`; Surface maps markers to DECCKM-aware arrows and bare-arrow chunks to SGR wheel; Manager keeps `herdr.activeTerminalIsPane` current |
| S8 (docs) | `architecture.md` rewritten for the final design; responsibility map in `code-architecture.md` gains Pane editors |
| Pane name | [`pane-name-spike-findings.md`](pane-name-spike-findings.md): terminal created without `name` so `onDidChangeName` works; tab name is the raw `terminalTitle` with no-break spaces |
| Tab move | Surfaces are disposed on `onDidCloseTerminal`; a tab that disappears while its terminal lives (move between groups) is re-bound through the temporary name |
| Tests | Separate testing phase per [`testing-handoff.md`](testing-handoff.md): Surface behavior (vitest), observer/attach processes (integration), Pane editor tabs (extension host) |
| Review | One two-axis review (Standards, Spec): no blocking findings; the Manager now clears `herdr.activeTerminalIsPane` on dispose; the other minor findings were accepted as is |

## Final state

Issue #16 is complete: typecheck, lint, format:check, build, `npm test` 72/72, and `npm run test:extension` 10/10 pass; the manual Extension Development Host check passed; issue #16 was rewritten to match the implemented design.

Review findings accepted without a change: a DECCKM sequence split across two PTY output chunks is not recognized, and the DECCKM flag is not reset when a new attach starts (both only choose between two arrow encodings most programs accept); observer failures are logged by both the adapter and the Surface.

Follow-ups: #29 (kitty keyboard flags), #30 (intermediate frames on tab switch), #31 (tab lost after moving into a new window). The spike branch `spike/s7-arrows` and its worktree are kept locally for now.
