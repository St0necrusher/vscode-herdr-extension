# astra-arch-1 — architect review

## Summary

- **Verdict: accept the whole-grid policy with the amendments below; not yet ready for implementation dispatch.**
- This replaces the additive policy, by the owner's explicit delegation and intent in `progress.md`, not by the original issue #19 wording.
- Keep the proposed layer boundaries, n-ary visual tree, weighted descriptor, and focus-by-index helper.
- **Amendment:** break move cycles with one owned, empty, non-dirty untitled editor, not a virtual-document provider or layout-reapplication loop.
- **Explanation:** use Eighth + a computed number of Next commands beyond eight; raw Herdr cell extents are valid branch weights.
- **Amendment:** state the move scheduler, placeholder cleanup, identity/wait contracts, and unsupported-environment boundaries explicitly.
- Two factual readiness gates remain: selection isolation before `moveActiveEditor`, and actual manager identity/lifecycle preservation through moves and surplus merges.
- These are ordinary existing-editor cases, not hypothetical user-input races; targeted evidence is required before dispatch.
- No owner question remains. The coordinator should fold the decisions into `architecture.md` and obtain the two missing facts.
- No code, ADR, glossary, or `architecture.md` changes were made by this review.

## 1. Policy and architecture

**Explanation — approved policy.** The owner's examples require positional reuse of the entire grid, surplus merge into the last cell, and reuse of existing Pane Editors. `setEditorLayout` expresses this directly. Research Q1–Q3 and prototype cases 1–4 support both mapping and sizes. Issue #19 still contains contradictory additive/fallback requirements; the precedence statement in the draft is correct. Do not implement both policies or retain an adjacent-column fallback.

**Explanation — approved ownership.** `tabLayoutTree` describes Herdr's visual geometry, so sessions may own it without VS Code dependencies. Descriptor conversion and the overall scenario belong to `features/open-tab`. The Pane Editor resource owner may sequence its own placements; it must not fetch another module's live state or own `setEditorLayout`. Generic group activation and event waits belong to `core/editor-groups`. This follows ADR 0014 and `ARCHITECTURE.md` §§1, 2, 4. Current code evidence: `OpenTabFeature.ts:1–6,30–65`, `PaneTerminalSurfaceManager.ts:19–20`.

Do not add a planner service, generic placement framework, copied placement store, settings mutation, rollback, retries, or compatibility fallback. Temporary per-call move candidates derived from current tabs are not a second state owner.

## 2. The four decisions

### 1. Move cycles — amendment: owned empty untitled placeholder

Choose an **empty untitled text document**, shown pinned (`preview: false`) in the blocked source group. Track the exact resulting tab, not its label. It exists only while resolving that cycle; close that exact tab through the tab API. The placement operation owns cleanup in `finally`, including when a move fails. Never save it, add content, close all editors, or change user settings. A bumped `Untitled-N` counter is an accepted incidental cost; a provider registration, URI scheme and provider lifecycle are disproportionate for this temporary resource.

Use a deterministic fill-before-drain scheduler:

1. Create missing Pane Editors directly in their target columns and await their tabs.
2. Derive misplaced Pane Editors from current bindings. Move the first candidate in target order whose source has another tab that will remain after this move.
3. Await the move and recompute eligible candidates from current groups.
4. If candidates remain but none can move safely, put the placeholder in the first candidate's source and resume. Keep it until that source contains its assigned Pane Editor; close it, then continue. Multiple disjoint cycles are handled in turn, with at most one placeholder at a time.
5. Reveal every assigned Pane Editor, then focus the requested Pane last.

This scheduler depends on moving **only** the chosen Pane Editor; the selection gate below is therefore material.

**Why not reapply?** A swap alone can converge, but that does not prove preservation of the owner's positional mapping. Consider `[B] | [A] | [file,C]`, targeting A/B/C. Moving B to group 2 collapses group 1; the state becomes `[A,B] | [file,C]`. Reapplying a three-cell layout produces `[A,B] | [file,C] | []`. Subsequent Pane-only moves can finish A/B/C, but the file originally assigned to cell 3 has slipped to cell 2. Fixing that requires tracking and restoring arbitrary editors, not merely reapplying the descriptor. Preventing collapse preserves the invariant at its cause. Research Q6 and prototype case 11 demonstrate the empty-untitled mechanism.

On failure, remove the owned placeholder even if the incomplete grid then collapses. Successful-operation shape guarantees do not imply rollback on failure. Preserve the primary error if cleanup also fails; cleanup must never close another editor.

### 2. Beyond-eight focus — explanation: accept computed hops

Use direct First…Eighth commands for 1–8 and Eighth followed by exactly `k - 8` Next commands otherwise. Await sequential commands and then the active-group predicate. No probe-until-success loop, directional navigation, far-end optimization, or eight-group cap. Research Q4/Q5 and case 7 prove grid-index order and operation in an unfocused window. The owner explicitly requested researching a real route before accepting degraded focus; this is that route.

### 3. Sizes — explanation: accept raw extents

Use widths under `right`, heights under `down`; VS Code normalizes each branch independently (research Q3, descriptor section, case 4). Flatten same-direction branches and preserve each promoted child's extent along the surviving parent axis. Do not carry the removed branch's size onto every promoted child. Root size is unused; use a documented sentinel such as 1 if the type requires it. Ratios are subject to VS Code minimum group sizes and pixel rounding, not a promise of mathematically exact screen proportions.

### 4. Exclusions — explanation, with a scope amendment

Accept no coordination with user clicks during the sequence, no auxiliary-window support, no special locked-group handling, full rather than zoomed layout, and VS Code's native preview-to-pinned merge behavior. Do not call all of these “unrealistic”: auxiliary windows and locked groups are real but deliberately outside this phase. State the supported baseline as the ordinary main-window editor grid with unlocked groups. Do not add detection or fallback machinery for excluded environments.

Pre-existing editor multi-selection is **not** a mid-sequence user race. It is not excluded: silently moving selected file editors would violate the policy even with no concurrent input.

## 3. Readiness questions and answers

| Question left to the implementer | Decision / proposed answer |
|---|---|
| Which requirement wins over issue #19 and ADR 0017? | Owner decisions in `progress.md`; replace, do not extend, additive projection. Keep one failure notification and no rollback. |
| Is `placePanes(sessionId, [A,B])` or `placePanes(requests)` authoritative? | The public seam is authoritative: `placePanes(readonly PaneTerminalOpenRequest[])`, each request carrying existing identity data, array order defining columns. Correct the walkthrough shorthand. |
| Who chooses the tree and retrieves layout? | Feature reads one existing session/layout snapshot and constructs requests; manager receives requests, never imports sessions. |
| Are cells persistent objects or stored targets? | No. They are request indices mapped to 1-based columns. Re-read live tab/group bindings after moves; do not hold stale `TabGroup` objects as the plan. |
| What replaces `openPaneInGroup`? | `placePanes` for this scenario; retain normal `openPane` semantics and the shared identity/opening path. Do not create a second terminal factory. |
| How are move dependencies and multiple cycles handled? | The deterministic scheduler in §2.1; create before moving, recompute after each move, one placeholder at a time. |
| Which placeholder, and who disposes it? | Empty pinned untitled document, exact-tab ownership in placement, cleanup in `finally`. No persistent provider. |
| Does revealing a Pane guarantee that no file editor is selected with it? | **Factual gate:** not established. Prove the reveal/open operation leaves only the target terminal selected, including a terminal already active in a multi-selection. Otherwise identify and validate a supported selection-isolation primitive before dispatch. Checking only `activeTab` is insufficient. Do not accept collateral file moves or invent an unproven guard. |
| Does binding survive a move or surplus merge? | **Factual gate:** prove through the actual manager, not just raw terminals. `PaneTerminalSurfaceManager.ts:183–198` binds by retained tab or synthetic terminal label, but first binding renames the surface (`PaneTerminalSurface.ts:191–199,252–265`). Research proves Terminal identity, not stable Tab identity or this fallback after rename. Exercise an already-bound, renamed Pane Editor through both operations. If it fails, amend the identity mechanism at its existing owner before dispatch; never duplicate/recreate the terminal as recovery. |
| Can a move trigger the manager's close path? | Include pseudoterminal close and retained surface/client identity in that same gate. `PaneTerminalSurface.ts:155–156` emits the close signal handled at manager `:65,162–166`; absence of `onDidCloseTerminal` alone is weaker evidence. |
| What do waits observe? | Await `setEditorLayout` completion, then desired group count using the existing bounded event waiter. For equal-count reshaping, command completion is the ordering barrier; do not await an event that need not occur. Assert shape at the extension-test seam, not with a new production shape-polling loop. Await terminal binding/target column after every create/move. |
| What proves a Pane is visible and finally focused? | After placement, reveal each terminal without changing group focus and await its active-tab state. Finally activate the focused Pane's actual target group, reveal it and await both active group and active tab. Plain `Terminal.show()` currently differs from the proposed preserve-focus path (`PaneTerminalSurface.ts:175–178`); make this intent explicit without changing ordinary `openPane` behavior. |
| What happens if focus information is absent or invalid? | Retain existing input/layout validation; no invented fallback to the first/last Pane. Failure is surfaced by the feature. Beyond-eight focus is no longer an error. |
| What about one Pane or zoom? | UI continues to expose the Tab-row action only for multi-Pane Tabs. A valid direct one-Pane command projects one group, merging the rest; full layout is used regardless of zoom. No new UI affordance or zoom-specific branch. |
| What does repeat-click promise? | Same final grid, terminals, visibility and focus; no duplicate clients or placeholder remains. Do not promise zero intermediate focus events, and do not add a cached-layout optimization. |
| What happens on disposal or session replacement during awaits? | Follow existing resource lifetime checks and `IMPLEMENTATION.md` Async/Lifecycle rules; prevent further effects after owner disposal. No separate speculative cancellation framework. |
| What is the allowed failure state? | Stop on the first operation failure, clean up only owned temporary resources, keep successful editors/groups, and show `Could not open Tab: <message>`. No destructive rollback or alternate layout. |
| Can “no new files” constrain implementation? | No; it is an estimate, not an architectural rule. Keep public exports through block `index.ts`; small private helpers may be split if ownership/readability warrants it. |

## 4. Verification and dispatch exit

Keep the draft's critical scenarios. Promote a move **from** a group beyond eight to critical: it exercises source activation, not merely final focus. Add a three-cycle or two disjoint cycles to the cycle test, with a file-bearing unaffected group and identity assertions; this catches drain/collapse and cleanup mistakes without testing private ordering.

Resolve the two gates with a focused prototype/source check before freezing briefs:

1. Existing multi-selected file + Pane Editor, including Pane already active: only the Pane moves; files keep their assigned group.
2. Actual manager, after initial binding/rename: surplus merge and subsequent movement preserve one surface/Terminal/client identity, correct tab binding, and no pseudoterminal close. Repeat with identical display names for different Panes so labels alone cannot appear sufficient accidentally.

The architecture is ready only after those results are incorporated and the coordinator records all answers above in `architecture.md`. No additional human design approval is required under this request's delegation. The present research supports the platform primitives but not these application-level assumptions. This review ran no new VS Code tests; code findings were obtained from a read-only `gpt-6-luna` delegate.

## 5. Domain record

No new domain terms: keep `CONTEXT.md` unchanged. “Cell,” “grid,” and “placeholder” are implementation vocabulary, not domain entities.

The consequential trade-off is whole-grid positional reuse/merge instead of additive projection. Proposed ADR treatment: because ADR 0017 is unmerged on this PR, replace/rename that ADR with the whole-grid policy and its reasons, explicitly recording loss of the old no-file-movement guarantee, preservation of file contents/dirty state, weighted layout, and index-based focus. Keep temporary scheduling details in the design unless their rationale proves enduring; no separate placeholder ADR is needed. The coordinator owns that documentation change after folding this review into the design.

<!-- end of reply -->
