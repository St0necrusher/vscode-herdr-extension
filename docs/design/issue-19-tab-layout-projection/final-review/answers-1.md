# intent-q1 — architect priorities for final review

## Summary

- **Explanation:** check ownership, whole-grid semantics, collapse prevention, identity/lifecycle safety, synchronization/focus, and removal of additive-policy leftovers—in that order.
- The most delicate decisions are cycle scheduling/cleanup (4–5), asynchronous placement/focus (6/11), and the explicitly accepted continuity limitation (16–19).
- The research gates are resolved, not permission to substitute a different reveal or identity mechanism without evidence.
- Do not mistake minimum-sufficient design for permission to remove concrete resource-safety guarantees.
- No new decision or amendment; no `progress.md` edit is needed.
- This is review guidance from the record, not a verdict on `snapshot.diff`.

## 1. Six intent checks — explanation

1. **Correct owners and real public boundaries.** `tabLayoutTree` stays editor-agnostic in sessions; descriptor conversion and the scenario stay in open-tab; `PaneTerminalPlacement` exposes ordered requests, not manager internals; pane-editors owns terminals/tab placement but neither imports sessions nor applies the grid. `focusEditorGroup` is domain-free core code. Cross-block imports use public `index.ts` entries. Composition wires the existing owners rather than introducing a second factory, resource owner or policy-bearing adapter.
2. **The owner's positional whole-grid contract, not merely a similar picture.** Exactly one group per Pane; original group i's files stay assigned to cell i; surplus editors append into the last cell without losing dirty content. Flattening preserves visual order and uses promoted children's correct axis extents. A terminal-filled screenshot alone does not prove preservation of the hidden file tabs.
3. **Prevent collapse at the cause.** Create missing terminals before draining sources; derive eligible moves from current bindings; break only blocked cycles with one owned empty pinned placeholder. Verify disjoint cycles, an unaffected file-bearing group, exact-tab cleanup, and preservation of the primary error. No layout-reapplication repair, arbitrary editor relocation, settings mutation or provider framework.
4. **Identity and lifecycle safety without expanding #73.** Reuse the same surface/Terminal; await correct binding after moves; never guess identity from display-name similarity. At most one live client per Pane throughout the operation. Accept existing rebind restarts/flicker, but not duplication, wrong-Pane binding, unnecessary moves, or keeping hidden editors selected. Ordinary `openPane` must retain its behavior.
5. **Ordering at the actual host boundaries.** Await layout command completion, then group count; equal-count reshaping must not depend on an event that need not fire. Activate the source and reveal the specific terminal before moving it. Await destination binding and final per-cell visibility; focus last, with computed Eighth + Next hops above eight and a final active-group/active-tab check. No OS-focus dependence, directional navigation or probe-until-match loop.
6. **No superseded policy or compensating infrastructure.** Remove recursive additive split/hop projection, `openPaneInGroup`, the eight-group rejection, old fallback assumptions and stale ADR/test expectations. Look for cached plans, redundant state, retries or recovery branches added to compensate for mistakes in placement. Tests should prove public outcomes with literal expectations, not enshrine private scheduler steps or production-derived expected shapes.

## 2. Decisions deserving the hardest scrutiny — explanation

| Decisions in `progress.md` | Risk / what to challenge |
|---|---|
| **4–5: cycle scheduler and placeholder** | Highest algorithmic risk: stale source/destination data, closing the placeholder too early, or mishandling a second disjoint cycle can silently shift files. The requirement is cleanup on success and failure of the exact owned tab, not the spelling of a `finally` block. The round-2 report describes normal-path closure plus catch-path cleanup; judge equivalence on reachable exits, including acquisition, rather than reporting syntax alone. If an exit leaks the resource, report it. |
| **6, 11, 15: focus, waits, reveal isolation** | The primitives were validated on VS Code 1.141.0. Check that implementation preserves the proven sequence and predicate, especially moves from beyond eight and moves while a file/Panes are multi-selected. A passing final focus assertion alone does not prove the source move was safe. No new compatibility layer is authorized. |
| **16–19: accepted continuity limitation** | This is the main deliberate compromise, not an unresolved gate. Restarts/Attach reset/flicker are accepted for this phase; incorrect binding, terminal replacement and duplicate clients are not. A heuristic “fix” or suppressing deselection would be scope drift. Conversely, do not reject solely because the documented restart occurs. |
| **12 and architecture Lifecycle §7: minimum lifetime handling** | Review the removed guards against realistic disposal/replacement paths, not stylistic preference. Existing ownership invariants must still hold across awaits. Do not demand a new cancellation framework or repeated hypothetical checks; do not assume every removed check was redundant merely because the report calls it guard soup. A finding needs a concrete reachable failure and effect. |
| **7: flattened size semantics** | Same-direction flattening can preserve shape yet corrupt weights by retaining a removed parent's extent. Read the transformation against literal unequal-size/nested fixtures; distinguish wrong weights from VS Code minimum-size/pixel rounding. |
| **25–28: evidence scope** | Confirm maximum concurrent client count is measured during operations, dirty/pre-existing untitled documents are not mistaken for placeholders, and two disjoint cycles actually execute. Approval of scenarios did not certify their implementation or the production diff. The old-policy test exemption expired after the tests slice; only the specifically recorded environmental failure is separately explained. |

The supported-environment exclusions in decision 8 remain deliberate scope boundaries, not claims that locked groups or auxiliary windows cannot exist. No need to add guards for them. If your review exposes a concrete contradiction in a supported scenario, report the evidence and return it to the architect; do not silently broaden an exclusion or weaken an invariant.

<!-- end of reply -->
