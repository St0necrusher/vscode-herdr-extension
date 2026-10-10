# Architect readiness check: #74

## Summary

- **Verdict: sound ownership and small design; not ready for delegation until the record gaps below are resolved.** No replacement architecture is warranted.
- Keep membership in `PaneTerminalSurfaceManager`, by managed-object identity; keep ordinary `openPane` independent of navigation.
- Main contradiction: the singleton `herdr.openTab` contract versus “every created placement joins” and “no special branch.”
- Main unverified seam: surface removal is not evidence that VS Code has finished removing its group; S2–S4 need an ordering gate.
- Record precise target/binding lookup and membership mutation rules; return both Pane/Agent command Promises.
- Keep #73 orphan repair and #19's overlapping-click exclusion out of implementation scope; do not add a queue or recovery framework.
- Open intent questions I1–I6 are now on B1–B4 in `map.md`, with recommendations and inconvenient before → after cases.
- The owner may resolve already-discussed questions from the design discussion; only new/changed intent goes back to the user.
- `progress.md` records these decisions and proposals. `architecture.md`, source, tests and ADRs are unchanged; no commit.
- Evidence: read-only Luna research at `answers/luna-research-74-{1,2}.md`; no runtime tests were run.

## 1. Implementer questions and proposed answers

### Q1. Which identity and scope define membership/target matching?

**Explanation.** One manager-wide set, not a set per selected Session. Resolve a target using `(sessionId, paneId)`; identical Pane IDs in different Sessions must never spare an old member. Retain managed-object identity through `pane.moved`; do not substitute the newly selected Session into a captured request. Session selection alone does not clear membership.

Evidence: `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:12–22,173–184,256–276`; requests capture the Session at entry in `src/views/sidebar/panes/VsCodePanesView.ts:142–149` and `src/features/open-tab/OpenTabFeature.ts:30–45`. The manager spans Sessions, and rekeys the same object on a move. This is the simplest interpretation of “latest Tab click.” **Proposed amendment:** state it explicitly; I1 asks the owner to confirm the unshown cross-Session consequence, not to invent a second owner.

### Q2. Exactly where is membership added/removed?

**Explanation.** Add only on the `placePanes` create/recreate branch, immediately when the new managed surface is owned, before its asynchronous binding/reveal completes. Do not add in generic `openPaneSurface`, which ordinary Create/Split/npm paths share. A kept surface retains either membership or non-membership. Remove in the existing surface-close lifecycle for every close source, and clear on manager disposal. Partial placement failure retains membership for successfully created, still-open members; no rollback.

Evidence: manager `:44–69,103–117,159–168,188–194`; `src/modules/pane-editors/PaneTerminalSurface.ts:155–156` supplies the close callback even in moved-tab cases. This follows D1/D6 and resource registration rules; no parallel membership store or terminal factory.

### Q3. What exactly does “other members close first, then inspect target” mean?

**Explanation.** Snapshot former members and clear membership synchronously. Close the former members other than the target through the shared close-and-wait path. Only afterwards read the target's current bound tab, its group's complete tab list, and the current groups. “Something else” means any other editor tab, not just a file or a non-member. Never cache columns/group counts before the await. A former member sharing the target's group may have just been removed.

Evidence: the current displaced loop already recomputes after closes because group indices shift (`PaneTerminalSurfaceManager.ts:76–100`). Object identity remains the owner of the selection/tab binding (`:173–184,209–224`). **Proposed amendment:** make these evaluation points explicit in the algorithm.

### Q4. Does the close wait establish that the remaining group is ready?

**Proposed amendment; verification gate.** Do not claim this is established by the existing helper. It awaits binding, `tabGroups.close(tabs)`, then `getSurface(managed.selection) !== managed` (`manager:91–98`). That proves surface deregistration, not group disappearance. The old Tab flow subsequently applies `setEditorLayout`; Pane navigation will instead immediately branch on current group count and open into the active group.

Require a focused VS Code check of S2/S3/S4 at this exact boundary, including retained target identity in S3 and recreation into the file group in S2/S4. If the existing awaited close already provides the necessary ordering, keep it. Otherwise specify a bounded host-state wait based on the observed ordering. No arbitrary delay, placeholder, or unconditional group-absence predicate. `workbench.editor.closeEmptyGroups=false` makes that last predicate impossible; I4 asks for the baseline explicitly. Existing prototype evidence used a separate settle and does not prove this boundary (`research/whole-grid.proto.test.ts.txt:24,258–266`; prior review `docs/design/issue-19-tab-layout-projection/reviews/recreate-1.md:31–47`).

The design's exclusion of “VS Code's empty-group removal” must mean not retesting VS Code itself; it cannot exclude verifying our dependency on its completion.

### Q5. Hidden or unbound target: absent, keep, wait, or recreate?

**Explanation.** Resolve via the manager map, never visible-presence state. Bound-but-hidden is ordinary and can be revealed without recreation; do not equate hidden with absent. For a member whose group must be examined, use the existing bounded binding wait before reading its group. Do not heal persistent unbound orphans or add a duplicate terminal fallback. Ordinary transient binding is already supported; persistent hidden-manual-merge orphaning belongs to #73. Missing targets use the ordinary opening path.

Evidence: manager `:53–69,135–140,209–253`; hidden-in-place test `test/extension/tab-layout.test.ts:176–196`; manual move rebinding `test/extension/pane-editors.test.ts:183–214`; ADR 0017's explicit #73 limitation. A target closed concurrently by the user is part of the existing user-input race exclusion, not a reason for new recovery machinery.

### Q6. What happens for a one-request `herdr.openTab` call?

**Proposed amendment; owner resolution needed.** Normal singleton rows invoke `herdr.openPane`, so they already retire without starting membership. However, the direct Tab command is registered and the layout suite invokes a singleton fixture. The draft's unqualified placement rule creates membership there, contradicting S6/ADR 0018. It can also preserve an old requested member although a singleton must start none.

Recommended resolution: preserve the direct command's existing whole-grid layout semantics, but a one-request Tab operation retires prior membership and creates no new membership. This requires explicitly distinguishing that case in the manager's extended placement contracts; keep the feature sequence unchanged if practical. Alternative: scope the no-projection guarantee to actual singleton-row navigation and explicitly document direct-command semantics. The owner must choose; “there is no row” alone does not settle the tested command contract.

Evidence: `PanesModel.ts:97–102`; `VsCodePanesView.ts:153–160,169–200,225–227`; `package.json:70,292–294`; `test/extension/tabLayoutFixtures.test.ts:72–74`; `test/extension/tab-layout.test.ts:23–31,415`. Map I2 records the consequence.

### Q7. What survives failed retirement and who reports it?

**Explanation.** Literal clear-first means surviving former members are ordinary editors after a refused close/timeout. A later Pane navigation will not retry them. This is consistent but is a stronger choice than merely “no rollback.” Map I3 makes it visible. Tab retirement differs: members are removed by successful close, so a failure can leave surviving members tracked. Do not silently unify those two policies in the helper.

**Proposed amendment.** State the post-failure membership explicitly and require both command callbacks to return/await `navigateToPane`. Existing Pane callback discards the result (`VsCodePanesView.ts:50–53`); Agent command/helper are void (`RevealPaneFeature.ts:14–15,24–31`). Tab errors already use an explicit `showErrorMessage` catch (`OpenTabFeature.ts:15–20`). Returning a rejection establishes command failure propagation; this source review does not prove that every tree-command rejection displays the intended notification. Confirm the host behavior or specify the existing explicit error-message pattern; do not leave a fire-and-forget Promise.

### Q8. Must operations serialize, cancel on Session switch, or add disposal guards?

**Explanation.** Not under the inherited scope. A second click can interleave with Tab close/layout/place/focus, but #19 explicitly excludes coordination with user clicks (`issue-19.../architecture.md`, Decisions 4). Copy that exclusion into this design; I5 exposes the inconvenient result. No queue around individual manager methods would serialize the whole Tab operation anyway.

Session switching does not dispose the manager. Preserve captured request identity. Source permits creation after a hypothetical disposal continuation, but the prior review treats deactivation as the disposal boundary and rejects general per-await guards (`issue-19.../reviews/recreate-1.md:61–72`). No new cancellation framework without evidence of a newly supported lifecycle. The within-command group re-read in Q3/Q4 is not excluded concurrency.

### Q9. Which document is authoritative and is approval recorded?

**Explanation.** `progress.md` records owner approval; `architecture.md` still says draft/awaiting approval. The owner's next revision should mark approval and readiness separately, incorporate the answers above, and use current ADR 0017 rather than accidentally resurrecting the superseded move/placeholder portions of #19's historical design.

## 2. Map/design traceability

| Box | Serving design elements | Gap |
|---|---|---|
| B1 membership | manager-owned object set; close lifecycle; created-only placement | Explicit Session scope and partial-failure registration, Q1/Q2 |
| B2 Tab retirement/start | extended displaced close + unchanged layout/place/focus sequence | Singleton command contradiction, Q6 |
| B3 Pane/Agent retirement | `PaneEditorNavigation`, both adapters, clear/close/open | Close settlement, Promise/error contract, Q4/Q7 |
| B4 clicked member | spare target, inspect surviving group, optionally recreate | Live binding/group evaluation, Q3–Q5; scrollback consequence I6 |
| B5 non-triggers | only navigation adapters change; ordinary opens stay separate | Add explicit sentence that focus/Space/Session subscriptions never clear membership |

**No box lacks an overall serving element.** B5 is served by deliberate non-action, not a missing module. **No orphan design element found:** the new interface/wiring serves B3/B4; helper serves B2–B4; in-memory state serves B1; error policy is a cross-cutting contract for B2/B3, now surfaced on the map. File layout and test updates support these boxes rather than constituting new product behaviors.

## 3. Consequences missing from the map

I added open intent questions, not approved decisions, to the affected boxes:

1. **I1 / B1:** Session A projection → select B → navigate in B: A's members now close; selecting B alone still closes nothing.
2. **I2 / B2:** direct singleton Tab command may accidentally make its Pane a future cleanup victim; recommended no-membership behavior needs an explicit exception/contract.
3. **I3 / B3:** partial Pane retirement can leave surviving editors untracked, so the next click does not clean them up.
4. **I4 / B3:** with automatic empty-group removal disabled, closing member editors does not guarantee the drawn collapsed grid; respect the setting rather than force-close groups.
5. **I5 / B3:** rapid overlapping clicks can let an earlier Tab operation repopulate the grid after a later Pane click; inherited exclusion, not new serialization work.
6. **I6 / B4:** S2/S4 recreate the clicked target, lose local VS Code scrollback and reconnect; the Herdr process is untouched. This is already in ADR 0018 but was absent from the map.

The owner should answer already-discussed items from the design session, not grill the user again unnecessarily. Questions that change behavior or expose a genuinely undecided consequence need user confirmation. Keep only the affected slices paused.

## 4. Challenges accepted and rejected

- **Wrong owner? Rejected.** Membership follows a managed resource, including rename/rekey/close. Moving it into a feature duplicates identity knowledge; a separate projection class has no independent lifecycle. Current manager is the smaller shape.
- **Seam leak? One real risk.** `placePanes` now means projection placement, not generic opening. Its contract must say created-only membership and singleton behavior. Existing use from `OpenTabFeature` is coherent; no reason to rename everything or expose the set.
- **Group-removal ordering? Valid unresolved evidence gate**, Q4. Unlike Tab projection, navigation has no subsequent layout command to normalize groups.
- **Hidden target? Not a failure by itself.** Keep the existing bound surface. Transient unbound uses bounded binding; persistent orphan repair remains #73.
- **Other Session? Valid identity check, not a separate projection.** Compare both IDs and spare only the actual target object; I1 covers visibility of cross-Session cleanup.
- **Rapid clicks? Reachable but previously excluded.** Do not expand #74 with a queue merely because the race can be described. Make the inherited limitation explicit.
- **Forced group deletion / settings mutation / fallback recreation? Rejected.** None follows from the accepted design; a disabled VS Code setting or known orphan must not silently trigger new product behavior.

## 5. Verification and documentation hand-off

Retain the draft's six critical scenarios. Strengthen S2–S4 with the exact group/identity ordering gate above; include a hidden-but-bound clicked target and a former member sharing the target group. Add narrow contract coverage for Session-qualified target identity and the chosen singleton-command semantics. Test the two entry adapters' returned Promises at the narrowest practical seam; do not create a new framework for tests. No source change or test execution was done by this review.

**Domain modeling:** no new domain term introduced. `Tab Projection` is already defined. After confirmation, propose a brief glossary clarification that its scope is this window's latest projection, not one per selected Session; keep algorithm details out of `CONTEXT.md`. ADR 0018 already records the meaningful trade-off and scrollback cost: amend its singleton/scope/baseline wording only if the owner confirms a clarification is needed. No additional ADR is justified by helper choice, waits, interfaces, or membership storage. Nothing was written to `CONTEXT.md` or ADRs in this review.

<!-- end of reply -->
