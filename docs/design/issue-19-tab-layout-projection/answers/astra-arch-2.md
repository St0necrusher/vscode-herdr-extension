# astra-arch-2 — Gate 2 decision

## Summary

- **Decision: A — accept the existing restart for this phase (amendment).**
- Preserve surface/Terminal identity and unambiguous binding; do not introduce heuristic identity matching or leave hidden editors selected.
- Explicitly accept the client restart, Attach interruption/reset, temporary synthetic title and presence flicker when a Pane Editor changes groups.
- This narrows my earlier continuity gate; it is not a claim that continuity passed.
- Gate 1 passes. Gate 2 passes identity/safety and has an explicitly accepted continuity limitation.
- No preparatory manager slice is authorized. Investigate continuity separately; no ticket was created by this review.
- Implementation dispatch may proceed after the coordinator folds both architect replies and this limitation into `architecture.md`.

## Decision and reason

**Amendment — choose A.** The invariant owner remains `PaneTerminalSurfaceManager`, together with the existing surface/selection lifecycle. It must retain the same surface and `vscode.Terminal`, never bind a Pane to another Pane's tab, never run duplicate clients, and eventually project the actual editor visibility and focus. A cross-group change is permitted to release and recreate its client under the current lifecycle policy.

This is a deliberate quality trade-off, not a dismissal of the problem. Research establishes that the current path is identity-safe even for equal display names; it also establishes that a moved live Attach is interrupted and its mode/screen state can reset. The owner's stated hard requirement is moving the same Pane Editor rather than closing/recreating or duplicating it. It does not expressly require a transport connection to survive the move. My earlier gate strengthened that requirement beyond the recorded owner intent. I am narrowing it rather than authorizing an unproven identity shortcut to satisfy it.

The minimum-sufficient-design rule favors the proven existing behavior over either proposed fix **as currently specified**. Do not add artificial restarts: retain the current mechanism and document its consequence.

## Why not B

B is not yet a demonstrated correction at the identity owner. Its evidence has a specific gap beyond the two-twin merge test:

- The recorded event timeline is target `TAB_OPEN`, then source `TAB_CLOSE`.
- On target open the original bound tab still exists, so the proposed lost-binding branch does nothing.
- If `previousTabs` is updated after every reconcile, the target is already in that set when source close finally removes the bound tab.
- Thus the target is **not new since the previous reconcile** at the moment the proposed matching runs. The stated algorithm can simply fall back on every normal move.

Preserving candidates across those events would require a different correlation lifetime and consumption rule. Also, exactly one candidate for a surface is not itself proof that exactly one surface owns that candidate; equal display names are not stable identities. Renderer-side sequential moves do not establish the extension host's event/snapshot granularity for all merges. Do not turn these gaps into production state and fallback branches without evidence.

This does not rule out a future precise movement-correlation mechanism. It rules out approving the supplied B algorithm as already proven.

## Why not C

The actual second reconciliation pass only processes `managed.tab !== undefined` (`PaneTerminalSurfaceManager.ts:201–210`). Removing the first-pass deselect therefore has no later deselection path for a terminal moved into the Panel and left without an editor tab. “The terminal is alive” does not mean its Pane Editor is visible.

Keeping an Attach selected indefinitely for an editor that is no longer present violates a stronger existing lifecycle invariant than the restart violates. Solving that requires a trustworthy distinction between an in-flight rebind and a completed move out of the editor area. Neither the request nor the research supplies that distinction. Do not add a grace-period timer, indefinite pending-selection state or projection-only suppression flag as a substitute.

## Observable contract for this phase

- Cross-group merge/move: same Pane surface and Terminal; no pty close or terminal recreation; no duplicate client; eventual binding, Visible marks and focus correspond to the destination.
- The existing synthetic-name recovery may briefly remove presence, flicker the title, stop/restart the client and reset Attach modes/screen state. No claim of seamless movement.
- Ordinary resulting visibility changes may also legitimately stop a client, and Observer geometry changes may restart one; tests must distinguish these from the identity guarantees rather than promising an unchanged raw client count.
- Repeating a projection with editors already correctly placed must not introduce unnecessary moves or additional identity-rebind restarts.
- Genuine hiding or moving out of editor groups retains the existing deselection behavior. Do not weaken it for projection.

Gate 1's reveal-before-move sequence is approved as researched: activate source group, reveal the specific Pane Editor, then move. No additional selection guard or selection API is needed.

## Scope and readiness

The continuity improvement belongs to a **separate bounded investigation/ticket**, not a prerequisite preparatory slice in #19. Its acceptance should require unambiguous identity across target-open/source-close events, two equal-name Panes in a surplus group, manual drag, moves to the Panel, and distinguishing legitimate visibility/geometry transitions from identity-caused restart. The implementation mechanism remains undecided; this is not an endorsement of B or C for that future ticket.

For #19, record the accepted limitation in the design and review/verification expectations. Keep the identity assertions from the gates, but do not write tests asserting uninterrupted clients or no title flicker under this accepted scope. All other decisions in `astra-arch-1` remain binding. Once incorporated, the two requested factual gates no longer block dispatch.

No new domain term or glossary change. No separate ADR is needed for retaining this pre-existing behavior; include the limitation in this phase's design. No code, architecture file, or tracker changes were made.

<!-- end of reply -->
