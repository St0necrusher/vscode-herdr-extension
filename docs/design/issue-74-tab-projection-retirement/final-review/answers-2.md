# Architecture-fit request 2 — unbound former member

## Verdict

**Explanation:** classify this as a **confirmed source-level regression, medium severity (P2)**, not merely a speculative #73 risk. On the supplied trace, a settled move to the Panel makes unrelated subsequent Tab navigation fail repeatedly; the first Pane/Agent navigation also fails. No concurrent clicks are necessary. I have not independently reproduced it in a host.

**Proposed amendment:** reopen intent on B2/B3 and ask the design owner to obtain the user's decision. Do **not** apply the proposed `tab !== undefined` filters as an already-approved correction. Do not sign off this finding as covered by #73 without that decision. The implementation can conform to the written algorithm while exposing a defect in that algorithm's supported-state assumptions.

## Why this is not automatically deferred

The supplied evidence at `PaneTerminalSurfaceManager.ts:106,121,247–256` distinguishes an unbound Panel terminal from the old hidden-merge orphan. Both lack a bound editor tab, but a Panel terminal need not be an orphan needing healing. More importantly, #74 adds the retired-member path that makes an unrelated Tab depend on that binding. The previous exclusion of repairing an orphan does not by itself approve this expanded navigation failure.

My earlier orientation retained #73's exclusion; it did not approve the new blast radius. The progress entry calling this a deferred risk is superseded by this answer for review classification.

## Why the suggested patch is not yet an explanation

Membership deliberately follows the managed object, not its current group. The definition describes how membership is acquired; it does not prove that an unbound member is outside the editor grid. The earlier source research established transient unbinding during a manual move as well as during initial creation (`answers/luna-research-74-2.md`, binding section). Thus `tab === undefined` is not reliable evidence of “in the Panel.”

Skipping all unbound members is a plausible small **behavioral amendment**, not a neutral implementation detail. It leaves those terminals alive, and on the Tab path retains their membership. If one binds again later, a later Tab click can close it; on the Pane path the set has already been cleared. That asymmetry needs to be intentional. Filtering non-target members also does not resolve clicking the unbound member itself: the target-group binding wait can still time out. State that residual limitation explicitly rather than claiming complete recovery.

## Recommended owner decision

Prefer keeping unrelated navigation usable without adding #73 orphan repair. Ask the user whether an editor explicitly moved into the Panel should remain open there and cease to obstruct retirement of the old editor grid. Then record the exact policy for membership and re-entry into the grid in `architecture.md`.

The reviewer-proposed bound-only retirement is a candidate minimal implementation if the owner accepts its broader treatment of **all** unbound members and its later-rebinding behavior. Do not invent a reliable Panel detector or a terminal-disposal fallback without source evidence; disposing the terminal would itself choose different visible behavior. No queue, generic recovery framework, or hidden membership store is called for.

What settles this: (1) owner's/user's intent on Panel-moved and otherwise unbound members, including target clicks and later re-entry; (2) a bounded real-host reproduction confirming the supplied settled Panel path; (3) a recorded narrow amendment, or explicit acceptance of the existing failure limitation. Runtime reproduction strengthens the evidence but the concrete source trace is already sufficient to keep the review finding open.

## Map consequence

Added **I7, open intent**, to B2/B3: project A, move one member to the Panel, then click unrelated Tab B. Before #74, the unbound surface obstructed only projection containing that Pane; after #74, every unrelated Tab click fails until a Pane/Agent click clears membership, and that first Pane/Agent click itself fails before opening its target. Recommendation: avoid poisoning unrelated navigation; exact unbound-member semantics require owner confirmation.

No source or architecture edits authorized by this answer; no new domain term or ADR required yet. Record the eventual behavior in the existing design/ADR 0018 if approved.

<!-- end of reply -->
