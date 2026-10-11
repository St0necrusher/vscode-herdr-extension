# Final review round — #74

- Baseline: `88ecf0b`. Snapshot: `24b50e1` (docs) + `c989928` (code) on `feat/74-retire-tab-projection`; no uncommitted source changes during review.
- Validation (worker, trusted; coordinator changed nothing after integration): `reports/production-2.md`.
- Reports: `standards.md` (luna, 0 findings), `architecture-fit.md` (opus + architect `astra-arch-74`, 1 finding; `answers-1.md`, `answers-2.md`).

## Triaged findings

| # | Source | Finding | Classification | Severity | Recommendation |
|---|---|---|---|---|---|
| F1 | architecture fit (first raised as risk in `reports/review-production-1.md`) | A Tab Projection member moved into the Panel stays an unbound member. Every later Tab click times out at `waitForPaneTab` (`PaneTerminalSurfaceManager.ts:106,121`). The first later Pane/Agent click clears the set but times out before opening its target (`:58`). Before #74, only a Tab containing that Pane failed. | confirmed defect (source trace, not reproduced in a host) | important | Owner decides I7 (map B2/B3). Candidate: retire only bound members, with the architect's caveats in `architecture-fit.md`. Then record it in `architecture.md`/ADR 0018 and reproduce in a real host. |

Coordinator check of F1: traced `closeDisplacedPanes` → `isRetiredMember` (no binding condition) → `closePaneEditors` → `waitForPaneTab` (bounded wait, throws) and `handleSurfaceClosed` as the only removal path. The trace holds. This is behaviour the user sees, so it is on the map as I7 and waits for the owner.

## Resolution

F1 is fixed in `d9f7a7d`, following the owner's I7 decision (2026-10-11): retirement closes only bound members. A real host reproduced both failures before the fix and showed both paths pass after it (`reports/production-3.md`).
