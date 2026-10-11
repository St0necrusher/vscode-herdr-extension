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

## Architect orientation — arch-fit-74-1

- Request `final-review/requests-1.md`; reply `final-review/answers-1.md`. Orientation only: no independent diff review and no new design amendment.
- Priorities: created-only object membership and Session-qualified identity; S1/S3 retention versus S2/S4 recreation after live group re-evaluation; evidence at the close/group-settlement boundary; no broad editor cleanup; distinct Pane/Tab failure transitions; awaited adapter errors.
- Accepted limits remain intact (direct singleton command, overlapping clicks, #73 orphans, settings baseline). Supplemental runtime checks do not waive outstanding fixture migration/typecheck/standard validation gates.

## Architect finding adjudication — arch-fit-74-2

- Request `final-review/requests-2.md`; answer `final-review/answers-2.md`.
- **Explanation:** reviewer-supplied source trace establishes a concrete #74 regression: a settled Panel-moved unbound member blocks unrelated Tab navigation repeatedly; first Pane/Agent navigation also fails before opening. Classified medium/P2, source-level confirmed, not independently host-reproduced here. Supersedes the earlier blanket “Deferred risk to #73” classification for this expanded blast radius; orphan healing remains excluded.
- **Proposed amendment, not approved:** keep unrelated navigation usable, but obtain owner/user intent before changing retirement of unbound members. The proposed bound-only filters are not a neutral fix: unbound does not uniquely identify Panel state, retained membership can close a rebound terminal later, and clicking the unbound target remains unresolved.
- Reopened B2/B3 with map intent I7 and inconvenient before → after. Owner must settle Panel survival/membership/re-entry and target behavior, record any amendment in architecture.md, or explicitly accept the limitation. A bounded host reproduction should confirm the settled Panel path. No source change authorized and no independent diff review performed.



## Final review — coordinator triage

- Standards (luna-std-74, tab closed): 0 findings. Architecture fit: F1 confirmed defect, important, user-visible → I7 on B2/B3 (opened by the architect). Recorded in `final-review/round.md`.
- Phase state: **blocked/incomplete** pending the owner's I7 decision; everything else accepted. Worker `sol-impl-74` kept open (ongoing) for the I7 correction.
- **I7 decided by the owner (2026-10-11): a Pane Editor moved into the Panel stays open there and does not block retirement.** Accepted the bound-only candidate from `final-review/architecture-fit.md` with its caveats: Tab path keeps an unbound member in the set (closed later if it rebinds); Pane path clears it (I3); clicking the unbound member itself still times out (#73). `architecture.md`/`map.md` amendment is parent-only → proposed in the final report.
- Round 3 requested: `requests/sol-impl-74-3.md`.
- Round 3 `reports/production-3.md`: bound-only filter in `isRetiredMember` and the `navigateToPane` close list, exactly as specified. Real host: before (c989928) both Panel-path failures reproduced 2/2; after, 2/2 pass, Panel terminal stays alive. Checks unchanged. Coordinator reviewed the two hunks directly (mechanical, specified by the architect's candidate); no slice-reviewer pass. **Accepted**; committed. F1/I7 resolved in code; architecture.md/map.md/ADR 0018 wording is a proposed amendment in the final report.
- Owner asked to record I7 (2026-10-11): `architecture.md` readiness answer 10, `map.md` I7 decided and B2/B3 closed, ADR 0018 paragraph and consequence. No CONTEXT.md change: the Tab Projection definition holds.

## Architect tests consultation — claude-coord-74-q1

- Request `requests/claude-coord-74-q1.md`; answer `answers/claude-coord-74-q1.md`. Explanations of accepted design and test-plan recommendations only; no product amendment or test-authoring authorization.
- Q1: retain proposed critical behavior scenarios; add the already-specified former member sharing the target group. Exercise I7 Tab and Pane paths independently, plus retained-versus-cleared membership after return to the editor grid. Strengthen D6 with subsequent navigation: old members retire, ordinarily opened non-member survives. No private-set assertions or new production hooks.
- Q1 failure paths: exclude synthetic close-veto/timeout injection unless a realistic controllable boundary already exists; no new seams solely for testing. I7 re-entry tests observe the membership asymmetry but do not claim close-failure coverage. Agent and drag cases remain owner-selected optional coverage; manual-close/reopen and cross-Session harness expansion may be deferred with explicit limitations.
- Q2: public manager.navigateToPane is appropriate for the real-host behavior matrix. Preserve an observable existing Pane-command routing assertion against the new navigation seam; fixture compilation alone is not adapter coverage, and Agent integration does not replace it.
- Q3: deletion of the obsolete return-to-Tab test agreed in principle, subject to retaining any unique still-valid assertions in the replacement scenarios; no independent test-body audit claimed.
- Q4: correctly typed rejecting unused navigation doubles are acceptable. Adapters catch rejections, so use existing unexpected-call observation where available and do not claim an unobserved rejection is a fail-fast guarantee.
- Q5: fixtures then projection tests sequentially, with agents-navigation owned by both only in their respective rounds. Restore typecheck/lint first; normal validation gates remain. Coordinator obtains approval of the refined bounded test set and optional selections before authoring. No new domain terms or ADRs.


## Tests phase — execution plan approved 2026-10-11

- Architect consultation `answers/claude-coord-74-q1.md` (refinements: shared-group clicked member; I7 Tab/Pane triggers independently + membership after return to the grid; D6 followed by navigation; keep the pane-command routing assertion; doubles may reject but adapters swallow errors).
- Approved scenarios: critical 1 (D5 rewrite), 2 (delete obsolete return-to-Tab test, keeping any unique still-valid assertion), 3 (D7), 4 (S1–S4 identity + hidden-but-bound + shared-group target), 5 (D1), 6 (S8), 7 (D6 + following navigation), 8 (I7: Tab and Pane triggers from fresh projections; membership after return to the grid, or a reported gap), 9 (fixture migration, pane-command routing kept). Optional selected: (a) Agent click retires, (b) D2 dragged member closes. Excluded: hand-close+Split, cross-Session, close-failure injection (I3/answer 7), error UI, Reload, private helpers, Panel-member target timeout (#73).
- Cut: slice `fixtures` (scenario 9) then slice `tab-projection` (1–8, a, b; owns tab-layout.test.ts, agents-navigation.test.ts). Sequential, main checkout. Worker `luna-tests-74`: pi gpt-6-luna max, skills tests, ongoing. Brief author sonnet, slice reviewer opus + shadow review. `test:` commit per accepted slice; full suite required except the baseline fresh-window focus test.
- Slice `fixtures` round 1 (`reports/fixtures-1.md`): typecheck/lint/format green, unit 158/158, extension 85 pass + 2 expected D5 conflicts, fresh-window baseline 0/1, composition 1/1. Shadow review: clean. Slice reviewer (`reports/review-fixtures-1.md`): accept, no corrections. **Accepted**, committed.
- Slice `tab-projection` round 1 (`reports/tab-projection-1.md`): all approved scenarios written; typecheck/lint/format green, unit 158/158, extension 98 pass / 2 fail (D2 dragged member does not close; shared-group case sees no p6E tab), fresh-window baseline 0/1, composition 1/1. Both failures involve a member moved between groups with `moveEditorToPreviousGroup`. Suspected cause to verify: the move leaves `managed.tab` unbound (reconcile binds by label), so the I7 bound-only filter (d9f7a7d) skips the member — would be a production defect against D2. Sent a diagnosis round (no production edits) to the worker: `requests/luna-tests-74-3.md`.
- Diagnosis `reports/tab-projection-2.md`: after `moveEditorToPreviousGroup` the moved member is momentarily unbound (presence empty, label is the published Pane name). This is the known #73 rebind cycle (new Tab on group change; reconcile rebinds only by the synthetic name after hiding the published one), not a new defect. The test waited for the `p6E` label, which the moved tab shows at once, so it navigated inside the unbound window; the I7 filter then skips the member (architect caveat accepted with I7: "binding is briefly lost during manual moves"). Coordinator hypothesis H3: arrangement error — wait until the moved member is bound again (public signal: Pane Editor presence) before navigating. Round 3 to the worker to verify.

## Architect adjudication — luna-tests-74-q1

- Request `requests/luna-tests-74-q1.md`; reply `answers/luna-tests-74-q1.md`.
- **Explanation, no amendment:** a projected member with a settled binding in another editor group retains D2 membership and must close on subsequent retirement when it is not the clicked target. I7 skips unbound members; it does not exempt bound grid members. S1–S4 still govern the clicked target.
- Worker reports both D2 and shared-group cases fail individually in fresh hosts after exact layout and public visible-presence waits resolve. This supersedes H3 as a sufficient explanation of the remaining failures. Classify the supported-scenario failure as a production-behavior defect pending diagnosis, not an accepted #73 limitation. Architect relies on supplied run evidence, not independent reproduction.
- Keep approved assertions and bounded settling wait; no production edits authorized in the test slice, no expected-failure/skip designation. Coordinator owns bounded production diagnosis of membership/identity retention and shared close lifecycle in PaneTerminalSurfaceManager. Verify the terminal-identity oracle during diagnosis; the failed assertion alone does not identify the faulty internal operation.
- Any narrowing of D2 requires owner/user approval and a recorded design amendment; none granted. Validation remains blocked by these failures. No new domain terms or ADR decisions.

- Round 3 `reports/tab-projection-3.md`: with a public-presence rebind wait both tests still fail (settled, bound, same Terminal, presence visible). Architect `answers/luna-tests-74-q1.md`: production defect against D2 — a settled moved member must close; cause not yet identified (membership, object selection, or close lifecycle). Test work kept as is. Coordinator opens production slice `moved-member` (diagnose + fix in PaneTerminalSurfaceManager), worker `sol-fix-74` (pi gpt-6.1-sol high, the owner's implementation choice), skills implement-slice, diagnosing-bugs.

## Architect lifecycle adjudication — sol-fix-74-q1

- Request `requests/sol-fix-74-q1.md`; reply `answers/sol-fix-74-q1.md`. Direct adjudication using worker-supplied trace/C10 precedent; no independent source audit or reproduction.
- New evidence narrows the prior defect classification: membership and current-tab selection survive the settled move; tabs close, both Pseudoterminal callbacks run, surfaces deregister/dispose, and navigation succeeds. The failure is retained host Terminal enumeration/missing onDidCloseTerminal, also documented by existing C10. Classify this reproduction as an unresolved host-lifecycle/test-oracle conflict, not a confirmed membership-retirement defect. Still verify resource/client release versus merely stale enumeration.
- Authorized only a bounded reversible terminal-first experiment in the worker's already-owned manager/surface files, tests unchanged. Observe exact tab/Terminal/callback and client lifecycle, retained-target behavior, completion/error semantics; remove diagnostics and restore a failed experiment. No production acceptance granted.
- Terminal-first disposal may pre-empt tab-close refusal even if tabGroups.close is subsequently called. Replacing/pre-empting that contract is a proposed amendment requiring coordinator/design-owner approval, not automatically an explanation. A proven behavior-preserving local lifecycle correction can go through normal review.
- If disposal-first cannot repair host lifecycle, escalate exact host evidence and C10 precedent for an explicitly authorized oracle review. Preserve assertions in this worker slice; do not spoof events, mutate registries, add title matching, silently accept failing validation, or expand into #73. D2's grid retirement remains required; an event absence alone is not proof it failed. No new domain term or ADR decision.

- Slice `moved-member` (`reports/moved-member-1.md`, architect `answers/sol-fix-74-q1.md`): no production defect. The settled moved member is selected, its tab closes, PTY closes, surface deregisters and its client stops; VS Code 1.141 then skips onDidCloseTerminal and keeps the disposed Terminal in window.terminals for a terminal editor that changed groups — the host behaviour C10 already documents (`test/extension/pane-editors.test.ts:240-263`). Terminal-first disposal experiment did not help; reverted; production diff empty. Classification: test-oracle conflict. Decision (coordinator, within the approved scenarios): for moved members the tab-layout harness observes closure as C10 does — no editor tab and the Pane's Herdr client stopped — instead of onDidCloseTerminal/window.terminals. Worker sol-fix-74 closed. Round 4 to luna-tests-74: `requests/luna-tests-74-5.md`.
- Round 4 `reports/tab-projection-4.md`: `expectClosedAfterMove` (C10 oracle) for moved members; full suite green except the fresh-window baseline (extension 100/100, unit 158/158). Slice reviewer `reports/review-tab-projection-1.md`: accept; notes N1 (deleted test's Tab 12 → Tab 13 step — retiring into fewer cells — was still valid and not carried over), N2 (moved-close oracle matches tabs by label; relies on full group literals), N3 (active-tab wait added to shared postconditions, unreported). Shadow review agrees; N1 taken as a correction (the brief required carrying still-valid assertions), N2/N3 recorded. Round 5: `requests/luna-tests-74-6.md`.
- Round 5 `reports/tab-projection-5.md`: reverse D5 direction (Tab 13 over projected Tab 12) added; full suite green except the fresh-window baseline (extension 101/101, unit 158/158, composition 1/1). Coordinator reviewed the added test directly (small, specified correction). **Slice accepted**, committed. Worker luna-tests-74 closed. Tests phase complete.
