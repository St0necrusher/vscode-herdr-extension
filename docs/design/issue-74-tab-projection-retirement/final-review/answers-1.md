# Architecture-fit orientation — #74

No independent review of `88ecf0b..c989928` performed here. Priorities below explain the accepted design, not findings against the shipped change.

1. **Explanation — membership represents what the Tab click created, not everything currently visible.** Check created/recreated-only insertion in placement; an existing in-place non-member stays a non-member; repeat clicks preserve membership; ordinary Create/Split/npm opens never join or retire it. One manager-owned object set follows moves and closes, across Sessions. Spare the target by Session-qualified identity, never Pane ID alone.

2. **Explanation — clicked-member behavior is the central user intent.** Other members close first; only then inspect the target's live binding, all tabs in its group, and current groups. S1/S3 retain terminal identity; S2/S4 recreate in the active remaining group. Hidden-but-bound is not absent. A group containing any other tab protects the target from recreation. Neither cached group counts nor unconditional target recreation matches the intent.

3. **Explanation — most uncertain seam: close completion versus group settlement.** Surface deregistration alone did not prove group removal. Scrutinize the reported real-host S2–S4 evidence and whether it exercises the actual decision boundary, not just an eventually correct final grid. Any added wait must follow observed host behavior, be bounded, and not assume groups disappear when `closeEmptyGroups` is disabled. This was a verification gate, not permission for delay-based stabilization or forced group closure.

4. **Explanation — retirement must not become broad cleanup.** Tab switching closes former members outside the requested Tab in addition to the pre-existing displaced-editor rules. Files are never closed; ordinary editors are not swept up merely because they occupy an old cell. Keep the existing Tab sequence and identity owner; no duplicated projection state, generalized navigation framework, or feature-owned membership.

5. **Explanation — asynchronous failures retain the chosen semantics.** Pane navigation clears membership before closing; failed survivors become ordinary editors. Tab retirement removes membership through actual closure instead. Both navigation adapters await and display `Could not open Pane: <message>`; ordinary opening remains separate. A shared helper must not accidentally homogenize these different failure transitions.

6. **Explanation — intentional limits are not missing implementation.** The owner chose no singleton-command special case: direct one-Pane `herdr.openTab` projects and joins; the actual singleton row uses Pane navigation. No queue/latest-wins, persistent orphan healing (#73), live tracking (#75), settings compensation, or speculative disposal framework. Review any deviation here as scope expansion, not automatic robustness.

7. **Explanation — verification remains qualified, not silently green.** Mandatory constructor changes force test-fixture migration beyond the two old Tab-switch expectations. `answers/sol-impl-74-q1.md` permits production review with documented conflicts and supplemental direct-build host evidence; it does not waive typecheck/standard test gates. Check that reports and completion claims preserve that distinction. Do not accept production fallback seams introduced solely to satisfy old doubles.

**Risk ordering:** group-settlement evidence first; membership/identity lifecycle and target retention next; adapter/error propagation after that. The singleton and overlap choices are accepted limitations, not provisional invitations to redesign. No proposed amendment at this orientation stage; escalate a concrete contradiction with evidence rather than expanding scope.

<!-- end of reply -->
