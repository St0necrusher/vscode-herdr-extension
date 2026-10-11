# Coordinator final report — #74

## Summary

- **State: implementation ready for human review.** The only remaining failures are the existing-test conflicts the design forces; they go to the tests phase.
- Commits on `feat/74-retire-tab-projection` (not pushed):
  - `24b50e1` docs (CONTEXT.md, ADR 0018, TD);
  - `c989928` feat (six `src` files);
  - `d9f7a7d` feat (I7 fix);
  - the final docs commit (records, this report).
- Cut: one production slice. Worker `sol-impl-74` (pi, gpt-6.1-sol high, owner's override), three rounds. The slice review (opus) accepted after two minor corrections. Round 3 implemented the owner's I7 decision.
- Gate 4 (group-removal ordering): passed in real VS Code 1.141.0, S2/S3/S4 ×3. The existing close-and-wait is enough, so no extra wait was added.
- Checks at c989928:
  - typecheck exit 2: 10 diagnostics, all in test fixtures;
  - lint exit 1: one error, a consequence of the same fixtures;
  - format OK;
  - unit tests: 158/158;
  - `test:extension`: blocked by the typecheck. A direct esbuild build plus the host runner gives 84 pass / 3 fail, fresh-window 0/1 (also fails at baseline), composition 1/1.
- Final review:
  - standards: 0 findings;
  - architecture fit: **F1, confirmed defect, important, now fixed.** A member moved into the Panel blocked every Tab click and the first Pane/Agent click. The owner decided I7 on 2026-10-11: such a Pane Editor stays open in the Panel and does not block retirement. Round 3 makes retirement close only bound members. A real host reproduced both failures before the fix (2/2) and showed both paths pass after it (2/2).
- Existing-test conflicts go beyond the brief's two. Fixtures typed `PaneTerminalOpening` are passed to the navigation constructors in 5 test files, and the `pane-command` runtime double has only `openPane`. All of this is test migration forced by the design (`answers/sol-impl-74-q1.md`). No test was edited.
- Proposed amendments: record I7 in `architecture.md` and `map.md`, and add a paragraph to ADR 0018 (text below). No new domain terms.
- Open delegates: worker `sol-impl-74` (w3:p7M; can be closed once you accept); architect `astra-arch-74` (w3:p7H). The standards reviewer's tab is closed.

## Implementation and changed contracts

- `PaneTerminalSurfaceManager`:
  - owns `tabProjection: Set<ManagedPaneSurface>`, window-wide and held by object identity;
  - implements `PaneEditorNavigation.navigateToPane`, which snapshots and clears the set, closes the other members, recreates the target if it was a member alone in its group while another group exists, then calls `openPane`;
  - `closeDisplacedPanes` also closes members outside `requests`;
  - `placePanes` adds only the editors it creates or recreates;
  - `handleSurfaceClosed` and dispose remove members;
  - a shared private `closePaneEditors` holds the close-and-wait. Its error text changed from `Could not close displaced Pane Editors` to `Could not close Pane Editors`.
- New public seam: `PaneEditorNavigation`, exported from `@modules/pane-editors`.
- `VsCodePanesView` (`herdr.openPane`) and `RevealPaneFeature` (`herdr.openAgentPane`) take `PaneEditorNavigation`, await it, and show `Could not open Pane: <message>`. `VsCodePanesView` drops its local duplicate of `errorMessage` and uses `@core/errors`.
- Create Pane, Split, Create Space and npm stay on `openPane` (D6). `OpenTabFeature` and `extension/` wiring are unchanged.

## Acceptance by map box

| Box | Decisions | Status | Where |
|---|---|---|---|
| B1 Tab Projection membership | D1 created-only membership, D2 follows drags, D3 memory only, I1 window-wide | done | `PaneTerminalSurfaceManager.ts` set, `placePanes` create branch, `handleSurfaceClosed`, dispose |
| B2 Tab click retires and starts | D5, I7 | done; an unbound member is skipped and stays a member | `closeDisplacedPanes` `isRetiredMember` |
| B3 Pane/Agent click retires | D6, D7, I3 clear-first, I7 | done; closes only bound former members | `navigateToPane`; both adapters |
| B4 Clicked member | D8 S1–S4, I6 | done, S2–S4 verified in a real host | `navigateToPane` target branch |
| B5 What does not retire it | — | done (no code path added) | — |

## Validation

Taken from `reports/production-1.md`, `production-2.md` and `production-3.md` (counts unchanged in each round). The coordinator's own integration changed no code, so the checks were not rerun.

| Command | Result |
|---|---|
| `npm run typecheck` | exit 2. 10 TS diagnostics in `agents-navigation`, `creation-commands`, `management-commands`, `run-npm-script` (fixture typed `PaneTerminalOpening`) and `pane-command.test.ts:140`. None in production code. |
| `npm run lint` | exit 1. `pane-command.test.ts:141` no-unsafe-argument, a consequence of the same fixture. |
| `npm run format:check` | exit 0 |
| `npm test` | exit 0, 16 files / 158 tests |
| `npm run test:extension` | exit 2, stops at the typecheck in its build |
| `node esbuild.mjs && npx vscode-test` (supplemental) | extension 84 pass / 3 fail; fresh-window 0/1; composition 1/1 |
| Gate 4 ad-hoc host check (deleted afterwards) | 9/9 pass, S2/S3/S4 ×3 |
| I7 ad-hoc host check (deleted afterwards) | before the fix: both failures reproduced (2/2); after: Tab layout and Pane opening succeed with the Panel terminal still alive (2/2) |

## Final-review findings (triaged)

See `final-review/round.md`. F1 is a confirmed defect of important severity, found by architecture fit with the architect, and it is on the map as I7. The standards review had no findings. Everything the architecture-fit reviewer considered and dismissed is listed in `final-review/architecture-fit.md`.

The owner decided I7 on 2026-10-11: a Pane Editor moved into the Panel may stay there. Round 3 (`d9f7a7d`) retires only bound members. Its accepted caveats:

- On a Tab click an unbound member stays in the Tab Projection, so a later click closes it if it returns to the grid.
- A Pane or Agent click drops it from the Tab Projection at once.
- Clicking that member itself still times out. This case belongs to #73.

## Existing-test conflicts

1. `tab-layout.test.ts` "switches from real Tab 13 to Tab 12 while retaining the other Tab's Pane Editors behind it" (expected, D5).
2. `tab-layout.test.ts` "returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13" (expected, D5).
3. `pane-command.test.ts` "Pane command rereads connected and stale state, ignoring missing Panes and group headings": the double has only `openPane` (not in the brief, design-forced).
4. Fixture types in `agents-navigation`, `creation-commands`, `management-commands`, `run-npm-script` and `pane-command`: the navigation constructors need `PaneEditorNavigation` (not in the brief, design-forced). These break typecheck, so CI `test` fails until the tests phase migrates them.
5. Not a conflict: fresh-window "takes keyboard focus from the Panes View" fails locally with the committed baseline manager too (no OS focus in the local test window).

## Deviations and proposed amendments

- No design deviations.
- The brief's list of failing tests was incomplete (items 3–4 above). The no-test-edit rule was kept.
- I7 (decided): add it to the readiness answers in `architecture.md`, close I7 on B2/B3 in `map.md`, and add this paragraph to ADR 0018, as the worker proposed: "A member moved into the Panel remains open and does not obstruct unrelated navigation. Retirement skips members without a bound editor tab. A Tab click leaves such a member in the projection, so later navigation may retire it after it returns to the editor grid; a Pane or Agent click relinquishes its membership immediately. Opening an unbound member itself remains subject to the existing bounded binding wait (#73)."
- `architecture.md` "Expected file structure" lists `test/extension/tab-layout.test.ts` as changed. It is deferred to the tests phase, together with the fixture migration.
- CLAUDE.md domain check: no new domain terms. Tab Projection is already in CONTEXT.md and the hard-to-reverse decision is ADR 0018. I7 adds only the ADR 0018 paragraph above.

## Manual check list (by map box)

Build: `node esbuild.mjs` (the `npm` build stops at the fixture typecheck), then run the extension. Use a Session with two Tabs of two or more Panes each.

- **B1/B2:**
  1. Open a file. Click Tab A and check that A is laid out.
  2. Click Tab B. A's Pane Editors close, the file stays, and B is laid out.
  3. Click B again. Nothing closes.
- **B3:**
  1. After Tab B, click a Pane row or Agent row of a Pane outside B. All of B's Pane Editors close, and the Pane opens in the remaining group next to the file.
  2. Create Pane or Split after a Tab click closes nothing.
- **B4:** start from a layout of `[file B][D]` (Tab click, then drag a file into B's group).
  1. Click B: you get `[file B]` and the same terminal, scrollback kept.
  2. Repeat the setup and click D: you get `[file D]` with a reconnected terminal.
  3. A two-Pane Tab `[B][D]`, then click D: you get `[D]`, same terminal.
- **B5:** after a Tab click, focusing a Pane Editor, selecting a Space, or switching Session closes nothing. A Pane click after switching Session still retires the earlier projection (I1).
- **I7:** after a Tab click, move one of its Pane Editors into the Panel, then click another Tab. The new Tab is laid out and the Panel terminal stays open. Repeat with a Pane row click instead: the Pane opens.

## Updated verification plan (`testing-scenarios`)

Seam: extension tests at the editor-group level (tabs per group, terminal identity, active tab).

Critical now:

1. Tab A → Tab B (no shared Panes): A's members close, files stay. This **replaces** both `tab-layout.test.ts` Tab-switch expectations (D5).
2. Tab click, then a Pane row on another Tab's Pane: all members close, and the Pane opens next to the file (D7).
3. S1–S4 with terminal identity: S1/S3 keep the terminal, S2/S4 recreate it. Plus a hidden-but-bound clicked member, and a former member sharing the target's group (D8).
4. A Pane Editor that was in place before the Tab click survives the next Pane click (D1).
5. Repeat click on the same Tab, then a Pane click: the original members still close (D1, S8).
6. Split or Create Pane after a Tab click retires nothing (D6).
7. **New:** migrate the navigation fixtures (`createNavigation` doubles, `pane-command` double) to `PaneEditorNavigation`. This is required for the typecheck and the CI gate.
8. **New (I7):** a member moved into the Panel does not block the next Tab click or Pane click, and it stays open. An ad-hoc real-host check reproduced the failure; this test pins the fix.

Optional: an Agent click retires (same seam as the Pane row); a dragged member still closes (D2); a member closed by hand and reopened by Split is not closed.

Deliberately excluded: VS Code's own empty-group removal (gate 4 already proved the ordering in a real host); the error notification path; Reload Window (D3); private helpers (`closePaneEditors`).

Test authoring needs the owner's approval of this set in the tests phase.

<!-- end of reply -->
