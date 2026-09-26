# Issue #16 observer-only Surface implementation report

## Result

Implemented the approved observer-only lifecycle in `VsCodePaneTerminalSurface`. The isolated Surface now invokes the existing `PaneClientFactory.createObserver` operation and does not start or implement direct attach. No extension composition or tests were changed.

## Criteria mapping

| Approved behavior | Implementation evidence | Status |
| --- | --- | --- |
| Start only after Pseudoterminal open, real dimensions, visible focus condition, and same-Session connected Pane target | `open`, `updateDimensions`, `subscribeToFocus`, `currentPaneForObservation`, and `reconcileObserver` gate creation. Undefined open dimensions remain undefined until `setDimensions`. | Satisfied |
| Stop for hidden, suspended/unavailable/incompatible/reconnecting projection, or changed terminal target | `reconcileObserver` requires `reason !== editor-hidden` and a same-Session connected Pane; otherwise `stopObserver` immediately removes the current resource identity and calls `stop()` without awaiting. A different terminal target replaces the current observer without waiting for cleanup. | Satisfied |
| Keep a valid observer over `pane.moved` with unchanged `terminalId` | Move handling uses the complete `currentPane`, retains the observer when its Session/terminal target matches, and permits the normalized moved Pane while the connected projection still has the old identity. | Satisfied |
| Reject stale output/completion from replaced observers | Each sink closes over its resource object and only publishes when it remains `this.observer`; completion handlers make the same identity check. | Satisfied |
| Failure placeholder/diagnostics without automatic retry loop | Synchronous creation errors and current-resource completion/failure set an observer-specific placeholder and log diagnostics. Failure does not reconcile itself; a later projection, focus/move, or dimension transition can retry. | Satisfied |
| Debounced observer resize using latest dimensions | Dimension changes while observing reset a 120 ms timer. At expiry the old observer is muted/stopped without awaiting exit and one reconciliation uses stored latest dimensions. Hidden/suspended surfaces store dimensions without starting a client. | Satisfied |
| Idempotent disposal and resource cleanup | `dispose` marks the Surface disposed, clears the timer and mutes/stops the observer before releasing subscriptions, terminal, and emitters. `stopObserver` clears the timer and invalidates output identity synchronously. | Satisfied |
| Keep the slice bounded | Only `PaneTerminalSurface.ts` changed in production source. No attach behavior, composition, tests, fixtures, configuration, or tracker changes were made. | Satisfied |

## Changed files and seams

- `src/infrastructure/pane-editors/PaneTerminalSurface.ts`
  - Added `PaneClientFactory` observer and `HerdrLogger` injection to the concrete Surface.
  - Added observer resource identity, eligibility reconciliation, async completion/failure handling, the resize debounce, and observer-failure presentation.
  - Reused the existing observer/client and terminal-output sink contracts; no other production seam changed.
- `docs/design/issue-16-focus-control-handoff/implementation-observer-surface-report.md`
  - Records this slice and the parent reconciliation evidence.

No tests were added or updated, per the approved scope exclusion. No files are staged.

## Validation

The implementation worker and parent reconciliation both ran the following successfully:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run build`
- `git diff --check`

The worker's first `npm run format:check` detected formatting in the edited source; it applied Prettier and reran the final checks successfully. The parent inspected the complete source/diff and reran all checks above successfully.

## Parent reconciliation

The parent traced every approved transition through `open`, dimensions, focus, active projection, `pane.moved`, observer completion, resize debounce, replacement, and disposal. Resource identity is invalidated before asynchronous cleanup, so late output and completion cannot affect a replacement. A move retaining the same Session/terminal target leaves the current observer alive. No architecture deviation or implementation correction was required.

## Owner-requested conditional-readability correction

The original implementation worker resumed with its retained context and refactored the multi-condition policies introduced by this slice without changing behavior or lifecycle ordering:

- `updateDimensions` names the dimension comparison as `dimensionsAreUnchanged`;
- `renderProjection` names the observer failure-display policy as `shouldPresentObserverFailure`;
- `reconcileObserver` names visible-target eligibility as `hasVisiblePaneTarget` and complete request equality as `sameObserverRequest`.

Unrelated stable conditionals were left unchanged. The parent inspected the corrected diff and found the extracted names preserve the accepted policy and execution order.

## Limitations

- Automated tests were not authored or run; tests are explicitly excluded from this slice. Runtime behavior therefore has compile, lint, format, build, source-trace, and diff-check evidence only.
- The new client/logger constructor dependencies are intentionally not wired into extension composition; composition replacement is a later approved slice.
- Direct attach remains unimplemented in the Surface.
