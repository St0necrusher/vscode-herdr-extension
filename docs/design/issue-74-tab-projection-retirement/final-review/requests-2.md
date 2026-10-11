from: arch-fit-74 (claude subagent of claude-coord-74, Herdr pane w3:p7K)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/final-review/answers-2.md
skills: architect

# Architecture-fit review of #74 — request 2 (findings I am unsure of)

Snapshot `88ecf0b..c989928`. I reviewed the whole change against `architecture.md`, `map.md`, ADR 0018 and your orientation (`final-review/answers-1.md`). Membership writes, Session-qualified target identity, read-after-close in `navigateToPane`, the clear-first vs close-only failure split, the shared `closePaneEditors` helper, D6/B5 non-paths, adapters awaiting with `Could not open Pane: <message>`, and the gate-4 evidence (`reports/production-1.md`, boundary snapshot taken right after the helper returned, S2/S3/S4 ×3) all match the design as I read it. One finding I am unsure how to classify; please answer it, marked explanation or proposed amendment, and record the decision in `progress.md`.

## Q1. An unbound member now breaks every Tab click (not only Tabs that contain it)

Evidence (`src/modules/pane-editors/PaneTerminalSurfaceManager.ts`, HEAD c989928):

- A member the user moves out of the editor area ("Terminal: Move Terminal into Panel", or dragging its tab into the Panel) loses its tab: `reconcileTabBindings` sets `managed.tab = undefined` (`:247-256`) and it stays unbound while it lives in the Panel. It is still a managed surface and still in `tabProjection` (only `handleSurfaceClosed`, `:220-221`, removes it).
- Next Tab click on any other Tab: `closeDisplacedPanes` marks it `isRetiredMember` (`:106`, no binding condition); `closePaneEditors` → `waitForPaneTab` (`:121`) times out (5 s) → `Could not open Tab: Timed out waiting for editor groups`; layout is never applied. Membership is kept (Tab path removes only on a successful close, readiness 7), so **every** later Tab click fails the same way until a Pane/Agent click clears the set — and that Pane/Agent click itself fails once (`:58` throws before `openPane` at `:66`), so the user's first Pane click after it also does not open the Pane.
- Before #74 the same unbound surface broke only a Tab that contained that Pane (`isMisplaced` needs `targetIndex !== -1`; `isInSurplusGroup` needs a tab).
- The slice reviewer raised this as a design-deferred risk to #73 (`reports/review-production-1.md`, "Risk, design-deferred"); progress.md records "Deferred risk to #73". It is not on `map.md` (B2/B3), and #73 is about orphan *healing*, while this is #74 widening the blast radius of an existing unbound state.

Readiness answer 5 says "A member whose group must be read uses the existing bounded binding wait. Persistent orphans are #73." I read that as covering the *target's* group read, not "every former member must bind before retirement can proceed".

Root-cause reading: a Tab Projection member is defined as a Pane Editor the click put "into its editor group" (CONTEXT.md); an unbound member is in no editor group, so there is nothing in the grid to retire. The owner of the invariant is the manager.

Proposed answer (amendment, small, at the owner): retirement only closes **bound** members — `isRetiredMember` also requires `managed.tab !== undefined`, and `navigateToPane` closes `members.filter((m) => m !== target && m.tab !== undefined)`. The Pane path still clears the whole set (I3 unchanged); the Tab path leaves an unbound member in the set, harmless, until a Pane click or its close. The transient "created but not yet bound" member exists only inside an in-flight `placePanes`, i.e. under overlapping clicks, which I5 excludes. Alternative: accept as-is and put the consequence on B2/B3 in `map.md` as an open `intent` question (before → after: a Panel-moved member → every other Tab click fails until a Pane click; was: only Tabs containing it).

Please say which you choose, and the classification you would give it (confirmed defect vs risk) and severity. If the record cannot settle it, say what would.

End the reply file with `<!-- end of reply -->`.
