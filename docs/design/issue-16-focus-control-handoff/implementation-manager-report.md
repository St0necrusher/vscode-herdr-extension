# Slice 3 implementation report: Pane terminal-surface manager

## Result

Implemented the manager over a minimal injected surface factory/handle seam. The manager owns one handle per logical `(Session ID, Pane ID)`, listens to Selection for creation/reveal and independently listens to the normalized Herdr `pane.moved` source for its registry identity. It retains surfaces on deselection and owns their disposal. The manager has no FocusTracker dependency and does not forward move or focus operations to a surface.

Each future concrete Surface is a separate consumer of `HerdrSessionEventSource` and `PaneEditorFocusTracker`; it will own its identity changes, focus-subscription rebinding, and observe/attach intent. No concrete Surface is implemented in this slice.

## Criteria mapped to implementation

| Criterion | Status | Evidence |
| --- | --- | --- |
| Selection creates/reveals one surface per identity; repeated selection reveals the existing surface | Satisfied | `PaneTerminalSurfaceManager.handleSelected` checks the nested Session/Pane map before calling the factory. Existing handles are revealed without duplicate creation. |
| Deselection retains the surface | Satisfied | The manager does not subscribe to deselection; surfaces remain in its registry until a later move or manager disposal. |
| Manager registry follows `pane.moved`, including retained deselected surfaces | Satisfied | The manager subscribes directly to `HerdrSessionEventSource` and moves its own registry entry from the event's previous identity to its current identity. It does not call the Surface handle or depend on Selection's `moved` event. The approved unique-destination domain invariant is relied on without collision handling. |
| Surface seam has no move or focus operations | Satisfied | `PaneTerminalSurface` exposes only `reveal()` and `dispose()`; `PaneTerminalSurfaceFactory.create()` receives the initial `SelectedPaneEditor`. |
| Manager disposal releases its subscriptions and every surface | Satisfied | Idempotent `dispose()` releases its Selection and Session-event subscriptions, disposes all handles, and clears the registry. |
| Keep future Surface behavior independently owned and this slice isolated | Satisfied | The architecture/progress record assigns direct event-source and FocusTracker subscriptions, identity/focus rebinding, and observe/attach intent to each future concrete Surface. No concrete Surface, terminal, PTY, CLI process, placement, extension composition, current #14 wiring, or tests were added. |

## Changed files and seams

- `src/infrastructure/pane-editors/PaneTerminalSurface.ts` — handle/factory seam with reveal and disposal only.
- `src/infrastructure/pane-editors/PaneTerminalSurfaceManager.ts` — Selection creation/reveal, direct Herdr event-source subscription, registry-key updates, and lifecycle.
- `src/infrastructure/pane-editors/index.ts` — existing infrastructure-local exports; unchanged in this correction.
- `docs/design/issue-16-focus-control-handoff/architecture.md` — records independent event-source fan-out and per-owner responsibilities.
- `docs/design/issue-16-focus-control-handoff/progress.md` — records the approved and implemented correction.
- `docs/design/issue-16-focus-control-handoff/implementation-manager-report.md` — this report.

The prior Selection, Session event, and FocusTracker source slices were preserved. `PaneEditorFocusTracker` was not changed. No extension composition or current #14 behavior was changed.

## Validation

The assigned checks were run after the correction:

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `npm run build` — passed (includes typecheck and esbuild bundle).
- `git diff --check` — passed.
- `git diff --no-index --check /dev/null` for changed untracked source and documentation files — no whitespace findings.
- `git diff --cached --quiet` — passed; no staged files.

No tests were added or run, as required by the slice exclusions.

## Lifecycle limitations and residual risks

Selection exposes events but no current-membership snapshot, so the manager must be constructed before Selection producers or selections are applied. Each future Surface likewise needs composition that supplies the shared Herdr event source and FocusTracker and ensures its subscriptions are established after Selection's event subscription has updated focus membership for a move. Concrete Surface implementation and automated coverage remain outside this slice.

No collision branch or recovery policy was added. The manager and each future concrete Surface independently consume the same normalized `pane.moved` stream and update only their respective state.
