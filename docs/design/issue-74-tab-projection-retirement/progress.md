# Progress: #74

## 2026-10-10

- Behaviour settled with the owner in a grilling session; recorded in ADR 0018, `CONTEXT.md` (Tab Projection), issue #74, and `map.md`. Live layout tracking split out to #75.
- Working tree (uncommitted, part of this work): `CONTEXT.md`, `docs/adr/0018-navigation-click-retires-the-tab-projection.md`, this directory.
- Design drafted in `architecture.md`; awaiting owner approval.
- Owner approved the design and authorized implementation; asked the architect to challenge it first.
- Architect: `astra-arch-74` (pi, openai-codex/gpt-6-astra, thinking low, ongoing), Herdr pane w3:p7H, tab w3:t5K. Readiness request: `requests/astra-arch-74-1.md`.

## Architect readiness check — astra-arch-74-1

Full answer: `answers/astra-arch-74-1.md`. Source evidence: read-only researcher `luna-research-74` (pi, `openai-codex/gpt-6-luna`, thinking `max`), reports `answers/luna-research-74-1.md` and `answers/luna-research-74-2.md`. No runtime verification, source/test edits, or commit.

Verdict: ownership accepted; delegation readiness not yet established. Owner must record answers in `architecture.md` and resolve the affected intent questions. That file's draft status is stale relative to owner approval above.

### Explanations / decisions within the accepted design

1. Manager remains sole owner; one set of managed-object identities. No projection service/class, copied store, or generic-opening membership hook.
2. Add membership only when projection placement creates/recreates a surface, before asynchronous binding; kept surfaces retain previous membership/non-membership. Remove through the existing close lifecycle and disposal.
3. Match target by Session plus Pane identity. Preserve the initiating request; do not reinterpret it using a subsequently selected Session. Single latest manager-wide projection is the current design interpretation; its visible consequence awaits I1 confirmation.
4. Close other members before reading the target's current binding/group tabs/group count. Any other editor tab counts as “something else.” Re-read rather than cache columns.
5. Hidden-but-bound targets use ordinary reveal. Use existing bounded binding for a member whose group must be inspected; do not add persistent orphan healing (#73).
6. Inherit #19's exclusion of overlapping user clicks and existing deactivation assumptions. No new queue/cancellation framework; this does not excuse incorrect within-command ordering.
7. Pane and Agent adapters must return/await navigation. Clear-first Pane failure leaves survivors untracked; Tab failure retains membership of members not actually closed. Do not erase that distinction in a shared helper.
8. Every map box has a design element; B5 is explicit non-action. No orphan design elements or new domain terms found.

### Proposed amendments / unresolved gates (not approved)

- Q4: prove the group-settlement boundary in S2/S3/S4. Existing wait proves managed-surface removal only, not group removal. No unconditional group-absence wait: respect `closeEmptyGroups=false`. Owner must clarify baseline and record evidence before delegating dependent navigation work.
- Q6 / I2: reconcile direct singleton `herdr.openTab` with ADR 0018. Recommended: retain its whole-grid command behavior but retire prior membership/start none. Normal singleton rows already use Pane navigation. The current “no special branch” plus all-created-members rule contradicts this recommendation.
- Q7: document partial-failure membership, return both command Promises, and confirm notification behavior rather than assuming a returned rejection proves a displayed message.
- Open intent questions I1–I6 added to B1–B4 in `map.md`: cross-Session cleanup, singleton command scope, failed cleanup survivors, disabled empty-group removal, overlapping clicks, and recreation's scrollback cost. Recommendations and before → after are on each box. Existing D1–D8 are unchanged; owner resolves previously discussed intent from its record and brings only genuinely new/changed behavior to the user.
- No new ADR proposed. After confirmation, consider only a glossary scope clarification and any necessary ADR 0018 wording alignment; no domain document was edited by this review.

- Architect readiness reply `answers/astra-arch-74-1.md`: design sound, gaps Q1–Q9 and map I1–I6. Design owner recorded answers in `architecture.md` "Readiness answers". Decided by the design owner: I2 (no singleton branch; command unreachable by the user), I3, I4, I5, I6 per the architect's recommendations. I1 (window-wide scope across Sessions) goes to the owner.
- Owner confirmed I1 (a): the Tab Projection is window-wide across Sessions. Dispatching the coordinator.
- Coordinator: `claude-coord-74` (claude tab, session default), Herdr pane w3:p7K. Brief: `implementation-brief.md`; final report: `reports/coordinator-final.md`.

## Coordinator execution plan — approved 2026-10-10

- One production slice `production` (owned: `PaneTerminalSurfaceManager.ts`, `paneTerminalOpening.ts`, `paneTerminalPlacement.ts`, `pane-editors/index.ts`, `VsCodePanesView.ts`, `RevealPaneFeature.ts`, `src/extension/…` wiring only if constructor types change). No split: one owner area, a contract-first slice would add a review round without parallelism. Main checkout, no worktree.
- Architect gate 4 (group-removal ordering in S2–S4) is verified inside the slice in a real VS Code; evidence in the worker report.
- No new tests; the two `tab-layout.test.ts` Tab-switch tests are expected existing-test conflicts.
- Worker: pi `openai-codex/gpt-6.1-sol`, thinking `high` (owner's override of the role map), `skills: implement-slice`. Brief author: subagent sonnet medium. Slice reviewer: subagent opus high, plus coordinator shadow review. final-review: standards (pi luna max) + architecture-fit (subagent opus high).
- Commits on approval of the slice: `docs:` (CONTEXT.md, ADR 0018, TD) then `feat:` (code). No push, no PR.

## Architect answer — sol-impl-74-q1

Request: `requests/sol-impl-74-q1.md`; decision: `answers/sol-impl-74-q1.md`.

- **Explanation, not a product amendment:** preserve the mandatory `PaneEditorNavigation` constructor dependency for Pane/Agent navigation. No optional fallback, casts, union compatibility seam, or production accommodation for obsolete tests.
- Worker identified additional design-forced fixture/type conflicts in `pane-command`, `agents-navigation`, `creation-commands`, `management-commands`, and `run-npm-script` extension tests. The two known Tab-switch tests were an incomplete conflict inventory. Record exact compiler/runtime evidence; these reported sites were not independently re-audited by the architect.
- Production slice remains test-read-only. Apply common.md's existing permission to report design-forced failures; the coordinator/testing phase owns migration of typed dependencies/doubles and any necessary asynchronous assertions.
- Direct existing esbuild entry + existing extension-host runner is allowed as **supplemental runtime verification**, with exact commands, fresh output and all failures reported. It does not constitute successful typecheck, normal build, or standard extension-test validation. Run remaining independent checks separately after the normal chained command stops; do not silently omit them.
- S2–S4 real-host ordering verification remains mandatory using the already authorized throwaway check and real manager/navigation seam. Remove the temporary check afterwards. Runtime fixture errors must not be conflated with the two behavior conflicts or called passing tests.
- Worker may submit the production slice for review with documented design-forced conflicts, but cannot claim all completion checks passed. Coordinator must reconcile the brief/acceptance gate and authorize fixture migration; this answer does not waive final validation or authorize test edits by the worker.
- No new domain terms or ADR decisions; architecture/source/tests unchanged by this answer.


## Slice production — round 1

- Worker `sol-impl-74` (pi, gpt-6.1-sol high, pane w3:p7M, tab w3:t5P, ongoing). Report `reports/production-1.md`; architect Q `answers/sol-impl-74-q1.md` (constructor seam stays mandatory; fixture doubles are design-forced test migration).
- Gate 4 passed in real VS Code 1.141.0: S2/S3/S4 ×3, groups settled when the existing close-and-wait returns; no extra wait added.
- Checks: typecheck exit 2 (10 diagnostics, test fixtures typed `PaneTerminalOpening` passed to the navigation constructors), lint exit 1 (consequent, pane-command.test.ts:141), format ok, unit 158/158, extension host via direct esbuild 84/3 + fresh-window 0/1 (baseline reproduces with committed manager) + composition 1/1.
- Existing-test conflicts beyond the brief's two: the fixture type migration (agents-navigation, creation-commands, management-commands, run-npm-script, pane-command) and the pane-command runtime double. Brief's inventory was incomplete; kept the no-test-edit rule, reported for the tests phase.
- Coordinator shadow review: logic matches the data flow and readiness answers 2/3/5/7; shared `closePaneEditors` serves both paths; membership only in `placePanes` create branch. Nits: `herdr.openPane`/`herdr.openAgentPane` handlers restructured from early return to nested ifs (churn); local `errorMessage` duplicate in VsCodePanesView replaced by `@core/errors` (same behaviour, standards-conformant).
- Slice reviewer (opus) `reports/review-production-1.md`: accept except two corrections, both also in or near my shadow nits: (1) redundant `length > 0` wrapper in `closePaneEditors` (`close([])` resolves true in 1.141, reviewer cited extensionHostProcess.js); (2) restore early returns in `herdr.openPane`. Reviewer caught (1), which my shadow review missed; I flagged the handler churn, the reviewer correctly limited it to VsCodePanesView (RevealPaneFeature already had the nested form at HEAD). Deferred risk to #73: a member moved to the Panel stays unbound, so later Tab clicks time out until a navigation click clears the set. Spot-checked: evidence for (1) quotes the shipped host code.
- Round 2 requested: `requests/sol-impl-74-2.md`.
- Round 2 `reports/production-2.md`: both corrections applied exactly; checks unchanged (same fixture diagnostics, unit 158/158, host 84/3 + 0/1 + 1/1). Coordinator verified the two hunks directly; no re-review needed for a mechanical correction the reviewer specified. **Slice accepted.**
- Committed per the approved plan: `docs:` (CONTEXT.md, ADR 0018, TD) and `feat:` (code).
