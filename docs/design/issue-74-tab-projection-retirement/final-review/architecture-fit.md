# Architecture-fit review: #74

**Verdict:** the change fits the design. Each block is in the right layer and there are no leftovers, workarounds or over-engineering. One important finding still needs the owner's decision.
**Findings:** 1. It is a confirmed defect of important severity: a design-level regression that the architect reclassified from "deferred to #73".
**Snapshot:** `git diff 88ecf0b..c989928` on `feat/74-retire-tab-projection`. 24b50e1 holds the docs, c989928 the code (six `src` files).
**Architect:** consulted (`astra-arch-74`): `final-review/requests-1.md` → `answers-1.md` (what to check), `requests-2.md` → `answers-2.md` (finding F1). The architect added the open intent question **I7** to B2/B3 in `map.md` and recorded the decision in `progress.md`.
**Standards:** the standards review (`final-review/standards.md`, 0 findings) was not repeated.

Summary:

- **Layering and ownership.**
  - `PaneTerminalSurfaceManager` is the only owner of the Tab Projection: one `Set<ManagedPaneSurface>`, window-wide, by object identity.
  - `features/open-tab` keeps its sequence and never sees membership.
  - Pane and Agent rows go through the new `PaneEditorNavigation` seam. Create, Split, Create Space and npm stay on `openPane` (D6).
  - `extension/` wiring is unchanged, because the manager already satisfies both constructors (`HerdrExtension.ts:106,116`).
- **Membership lifecycle.**
  - A Pane Editor is added only in the create/recreate branch of `placePanes`, and before binding.
  - It is removed through `handleSurfaceClosed` on every close path, and the set is cleared on dispose.
  - `pane.moved` keeps the object, so membership follows it.
- **`navigateToPane`.**
  - It takes a snapshot and clears the set synchronously.
  - The target is matched by Session and Pane.
  - The target's group and the group count are read only after the other members close, and nothing is cached across an await.
  - The clear-first failure path (Pane) and the close-only failure path (Tab) stay distinct, even though they share the `closePaneEditors` helper.
- **Gate 4.** The worker took a snapshot at the exact boundary in a real VS Code 1.141.0 host, right after the helper returned. S2, S3 and S4 each passed three times. Keeping the existing close-and-wait without an added delay is justified.
- **Over-engineering, workarounds and leftovers: none.**
  - `PaneEditorNavigation` is a narrow type, but D6 requires it.
  - `errorMessage` is deduplicated to `@core/errors`.
  - README, ARCHITECTURE.md, IMPLEMENTATION.md and ADR 0017 have no stale text about row navigation.
  - The verification claims in `progress.md` and the reports keep "fixtures are blocked" separate from "green" (architect point 7).
- **F1.** A member the user moves into the Panel makes every later Tab click fail. Before #74, only a Tab containing that Pane failed. The first Pane or Agent click after it also fails. See below.

## Findings

### F1. An unbound former member now breaks every Tab click, and the first Pane/Agent click

- **Where:**
  - `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:106`: `isRetiredMember` has no binding condition.
  - `:121`: `closePaneEditors` waits for every member's tab.
  - `:58` / `:66`: `navigateToPane` throws before `openPane`.
  - `:220-221`: only an actual close removes a member.
  - `:247-256`: a member moved into the Panel becomes and stays unbound.
- **Source:** architecture fit. It was first raised as a design-deferred risk in `reports/review-production-1.md`.
- **Classification:** confirmed defect. It is a source-level regression in the design's assumptions about which states are supported, not in conformance to the design. This follows the architect's answer, which supersedes the "deferred risk to #73" entry in `progress.md`.
- **Severity:** important. The architect rated it P2 (medium). No overlapping clicks are needed to trigger it, but it was not reproduced in a host.
- **Trace:**
  1. Project Tab A.
  2. Move one of its Pane Editors into the Panel ("Terminal: Move Terminal into Panel", or drag the tab). `reconcileTabBindings` sets `managed.tab = undefined`, and the editor stays a member.
  3. Click unrelated Tab B. `closeDisplacedPanes` marks the editor retired, `waitForPaneTab` times out after 5 s, and the user sees `Could not open Tab: Timed out waiting for editor groups`. The layout is never applied.
  4. Membership survives, because Tab retirement removes a member only on a successful close (readiness 7). Every later Tab click fails the same way.
  5. The next Pane or Agent click clears the set but also times out before `openPane`, so its target does not open. Only the click after that works.
- **Before #74:** `isMisplaced` needs the Pane to be in the requested Tab (`targetIndex !== -1`), and `isInSurplusGroup` needs a bound tab. So an unbound surface blocked only projections that contained that Pane.
- **Recommended fix: owner decision first, then a narrow amendment.**
  - The architect opened **I7** on B2/B3 in `map.md` and asks the owner whether an editor explicitly moved into the Panel should stay open there and stop blocking retirement of the old grid.
  - A candidate minimal correction: retire only bound members. `isRetiredMember` would add `managed.tab !== undefined`, and `navigateToPane` would close `members.filter((m) => m !== target && m.tab !== undefined)`. The Pane path still clears the whole set (I3).
  - The architect's caveats on that candidate:
    - `tab === undefined` is not a reliable Panel detector, because binding is briefly lost during manual moves and creation (`answers/luna-research-74-2.md`). The filter therefore treats every unbound member alike.
    - On the Tab path an unbound member stays in the set, and a later Tab click closes it if it binds again. The Pane path has already dropped it. That asymmetry must be chosen on purpose.
    - Clicking the unbound member itself still times out in the target's group-read wait. That limitation remains and must be stated.
  - No Panel detector, terminal-disposal fallback, queue or recovery framework.
  - Record the chosen policy in `architecture.md`, and in ADR 0018 if it changes the documented behaviour.
  - Before signing off, a bounded real-host reproduction of the settled Panel path would strengthen the evidence.
- **Architect answers that shaped this:**
  - `answers-1.md` point 6: #73 and the exclusion of overlapping clicks are accepted limits, not invitations to redesign.
  - `answers-2.md`: that exclusion of orphan repair does not approve the wider blast radius #74 creates, and the bound-only filter is a behavioural amendment rather than an explanation of the design.

## Considered and dismissed (no finding)

- **Direct one-Pane `herdr.openTab` joins the Tab Projection, while ADR 0018 and CONTEXT say "a single-Pane Tab retires and starts none".** False positive. I2 was decided by the design owner with no special branch. Tab rows exist only for more than one Pane (`PanesModel.ts:98`), so a single-Pane Tab is clicked as a Pane row, which goes through `navigateToPane`. The architect confirmed this as an accepted limitation (`answers-1.md` point 6).
- **`closePaneEditors([])` runs on every Pane click that has no projection.** No finding. `tabGroups.close([])` resolves `true` without IPC (evidence in `reports/review-production-1.md`), and an empty guard would be a check for a case that does no harm.
- **`PaneEditorNavigation` as a separate one-method interface next to `PaneTerminalOpening`.** No finding. D6 needs both seams: navigation retires the projection, while ordinary opening never does.
- **The manager now implements five interfaces.** No finding. The design keeps one owner on purpose ("No new module or class").
- **The `errorMessage` local in `VsCodePanesView` was replaced by `@core/errors`.** No finding. Behaviour is the same, it follows the standard, and it also serves `showTabMoveError`.
- **`architecture.md` expects a change to `test/extension/tab-layout.test.ts`, and typecheck/lint fail on fixture types at c989928.** Out of scope for this review. The design forces these test migrations, and they belong to the tests phase (`answers/sol-impl-74-q1.md`). The reports do not claim they pass.

<!-- end of reply -->
