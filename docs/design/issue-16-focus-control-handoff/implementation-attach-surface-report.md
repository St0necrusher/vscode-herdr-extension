# Issue #16 direct-attach Surface implementation report

## Result

Implemented the separately approved direct-attach lifecycle in `VsCodePaneTerminalSurface`, preserving the observer-only lifecycle from the prior slice. The isolated Surface now uses the existing `PaneClientFactory.createAttach` seam and handles Pseudoterminal input. Extension composition and tests remain unchanged.

## Criteria mapping

| Approved behavior | Implementation evidence | Status |
| --- | --- | --- |
| Create direct attach for an opened, dimensioned, visible, focused Pane in the connected active Session | `handleInput`, `currentFocusedPaneRequest`, and `reconcileClients` gate through Pseudoterminal lifecycle, FocusTracker reason, dimensions, and the authoritative current Pane target. Initial attach intent is enabled. `startAttach` calls `createAttach` synchronously and passes eligible triggering input directly to `sendInput` after creation. | Satisfied |
| Respect hidden, blurred, and suppressed-intent policy | `reconcileClients` selects neither client when hidden/suspended, observer while blurred or attach intent is suppressed, and attach while focused with intent. A fresh non-initial `window-focused` transition and eligible local input restore intent. | Satisfied |
| Handoff without waiting for observer exit; observer fallback without waiting for attach exit | Attach reconciliation invalidates/stops the observer before synchronously creating attach. Observer reconciliation invalidates/stops attach and starts/reuses observer without awaiting attach cleanup. | Satisfied |
| Prevent overlapping extension-owned attaches and recheck after waiting | `stopAttach` immediately clears current identity and retains cleanup. `ensureAttach` waits when cleanup is pending; the continuation runs current reconciliation, which rechecks disposal, lifecycle, dimensions, focus/intent, connected projection, and Pane target. Triggering input is neither buffered nor replayed across the wait. | Satisfied |
| Gate attach output/completion and avoid fight-back | Attach sinks compare current resource identity. `handleAttachCompletion` ignores stale resources; a current unexpected completion silently clears attach intent and reconciles to observer when eligible. | Satisfied |
| Resize correctly while preserving observer debounce | `updateDimensions` immediately resizes current attach and updates its request. Observer resizing retains the 120 ms debounce and latest-dimensions replacement. Hidden/suspended state stores dimensions without creating either client. | Satisfied |
| Apply failure and warning policy | Synchronous attach creation failures are logged and fall back to observer. Focus-triggered attempts remain silent. An eligible local-input failure warns at most once for its uninterrupted Surface/Session/Pane/terminal eligibility period after rechecking complete current eligibility; dimensions do not split that period. | Satisfied |
| Clean up both clients | `dispose` invalidates the Surface, disables intent, stops observer and attach independently without awaiting, and releases existing subscriptions, terminal, and emitters. Pending attach-stop continuations return through guarded reconciliation. | Satisfied |
| Preserve slice scope and readability policy | No composition, #14 integration, Yield/IPC, persistence, tests, or unrelated source changed. Multi-condition policies use named constants/helpers. | Satisfied |

## Changed files and seams

- `src/infrastructure/pane-editors/PaneTerminalSurface.ts`
  - Added `Pseudoterminal.handleInput`, attach intent/failure state, direct-attach reconciliation, output/completion identity gating, bounded-stop serialization for later attaches, warning eligibility, and immediate attach resize.
  - Reused `PaneClientFactory.createAttach`, `PaneAttach.sendInput/resize/stop/completion`, and the existing `PaneOutputSink`; no other production seam changed.
- `docs/design/issue-16-focus-control-handoff/implementation-attach-surface-report.md`
  - Records slice and parent-reconciliation evidence.

No tests were added or updated, as required by scope. No files are staged.

## Validation

The implementation worker ran the following successfully:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run build`
- `git diff --check`

The parent inspected the complete implementation and diff against every accepted transition, including focus/input intent, observer/attach overlap, stopping-attach serialization, stale completion/output, target moves, suspension, resize, warning eligibility, and disposal. Parent validation reran the same commands successfully.

## Parent reconciliation

The direct-attach resource identity is invalidated before cleanup, so its output/input and completion cannot affect a replacement. Observer creation may overlap attach cleanup, while any subsequent attach waits for the retained stopping attach and then re-enters complete current-state reconciliation. Unexpected current attach completion clears intent before fallback, preventing automatic takeover fight-back. The triggering input is sent exactly once only when attach creation occurs synchronously; input received while another attach is stopping is deliberately not retained.

No architecture deviation or implementation correction was required.

## Limitations

- Tests and live VS Code/Herdr runtime verification remain excluded and were not performed.
- Composition is intentionally unchanged and must later inject the existing Pane client factory/logger into the Surface factory.
- Input arriving while a previous attach is still stopping is not buffered or replayed. This preserves the approved no-buffer policy and leaves stronger first-input guarantees to #27.

## Fresh-context correction pass

This addendum records a bounded correctness/readability review of the uncommitted Surface against the approved lifecycle. It supersedes the earlier statement above that no implementation correction was required; the historical implementation scope and parent review remain unchanged.

### Independent transition trace and findings

- Before `Pseudoterminal.open` has real dimensions, reconciliation creates neither client. Once open and dimensioned, `currentConnectedPane` requires the connected active-Session projection and current Pane identity; the focus fact distinguishes hidden (no client), blurred (observer), and focused with attach intent (direct attach), with suppressed intent falling back to observation.
- Local input is accepted only for an opened, focused, dimensioned connected Pane. It restores attach intent and is carried only by the current reconciliation call. A live matching attach receives it once; a newly created attach receives it only after synchronous creation; input received while an attach is stopping is discarded and never replayed.
- Observer/attach handoff disables the outgoing resource before stopping it. Observer and attach cleanup may overlap; a retained stopping attach serializes later attach creation. Identity checks reject stale output and completion. Unexpected current attach completion clears intent before reconciling, so observation resumes without automatic takeover fight-back.
- Synchronous attach creation failure falls back to observation. Only a still-current input-triggered creation failure may warn. The former global `attachFailed` flag was not sufficient: a changed Pane, terminal target, dimensions, or Session could remain blocked, while transitions away and back needed explicit reset semantics. No architectural contradiction was found.

### Corrections applied

1. Replaced global `attachFailed` with `failedAttachFor: AttachRequestContext` covering Session, Pane, terminal target, columns, and rows. Only a current synchronous failure sets it; a request-context change clears it, and blur, hide/suspension, fresh refocus, or eligible local input also clears it. The same unchanged context suppresses automatic repeat without a retry loop.
2. Renamed `currentPaneForObservation` to client-neutral `currentConnectedPane` and updated the Surface call sites.
3. Replaced `reconcileClients(input?: string)` with a `ClientReconciliation` discriminated union for ordinary state change versus one-shot local input. Input is passed directly through synchronous creation/send, not retained while stopping; the warning path checks the local-input variant and current eligibility.
4. Removed the separate anonymous attach identity token. Attach output now gates against the same resource-reference identity pattern as observer output, including rejecting callbacks before the created resource is installed.
5. Renamed `reconcileAfterStateChange` to `reconcileAfterObserverRetryOpportunity`; it explicitly clears only observer failure before client reconciliation and does not reset attach failure state generally.
6. Renamed the focus subscription guard to `hasReceivedInitialFocusSnapshot` and documented that the initial callback is synchronous, so a move rebind is not treated as a fresh refocus.
7. Kept multi-condition policies named, including the observer retry presentation, eligibility, warning, output-availability, and moved-Pane checks.
8. Parent review found that the warning period must survive resize while eligibility remains uninterrupted. Separated `AttachWarningPeriodContext` (Surface-local, Session, Pane, terminal target; no dimensions) from the dimension-specific `AttachRequestContext` used to suppress repeated failed requests. The warning period still resets when visibility, focus, active connected Session, or attach intent eligibility is lost, or when Surface/Session/Pane/terminal identity changes.

### Validation and scope

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check` passed after the correction.
- No tests, composition, architecture/progress records, fixtures, configuration, tracker, staging, commits, or pushes were changed. Tests and live VS Code/Herdr runtime verification remain unperformed under the approved scope.
- Changed files for this pass: `src/infrastructure/pane-editors/PaneTerminalSurface.ts` and this report addendum.
