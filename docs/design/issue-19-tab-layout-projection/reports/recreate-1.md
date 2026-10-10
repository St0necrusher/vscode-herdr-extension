# Recreate placement — round 1

## Summary
- **Status: complete for coordinator review.** Displaced Pane Editors close before layout; missing editors are recreated directly in their cells.
- Changed: `OpenTabFeature.ts`, `PaneTerminalSurfaceManager.ts`, `paneTerminalPlacement.ts`, `test/extension/tab-layout.test.ts`; existing fixture edits preserved unchanged.
- Removed all placement moves, fill-before-drain, cycle/untitled placeholder machinery and source-group activation.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run format:check`: exit 0.
- `npm test`: exit 0; 16 files / 158 tests passed.
- Focused extension run: exit 0; all 22 Tab layout projection tests passed.
- `npm run test:extension`: exit 0; main 87 passed, fresh-window keyboard-focus 1 passed, composition 1 passed.
- `git diff --check`: exit 0.
- Tests changed: lone misplaced Pane, two-Pane swap, disjoint swaps plus closure-induced displacement, inactive group nine, and 12 → 13 → 12 now assert replacement/expected closure; 13 → 12 preserves other-Tab Terminals.
- Retained: literal shape/tabs/focus, dirty files, fewer groups, 2:1 sizes, repeat-click Terminal identity, focus beyond eight, maximum one live client per Pane.
- Design clarification: architect approved finite pre-layout closure batches until live columns are settled (`answers/sol-identity-q1.md`); E also recreates after earlier lone groups close.
- Deviations: none beyond that approved explanation. Questions: no implementation blockers; coordinator should fold the clarification and recreation decision into architecture/ADR 0017.
- No staging, commits, pushes, branch changes, architecture/ADR/glossary edits, settings mutation, sleeps, or new delegation were performed.

## Acceptance and implementation

| Requirement | Implementation / evidence | Status |
| --- | --- | --- |
| Feature owns close → layout → wait → placement → focus | `src/features/open-tab/OpenTabFeature.ts:41–45`; placement interface adds only `closeDisplacedPanes(requests)` | Passed |
| Manager owns exact Tab closure before unsafe merges | `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:73–103`: select requested misplaced editors and any managed editors in surplus groups; resolve their bound Tabs; close the batch through `tabGroups.close`; await registry removal through existing surface closure | Passed |
| Closing lone groups may displace previously correct requested editors | Same preparation recomputes live columns after each batch, creating nothing until preparation finishes; a refused close fails rather than looping | Passed; architect explanation |
| Keep correctly placed editors; create missing directly in cell order | Manager `:105–123` uses existing opening path, awaits binding and active tab, checks current surface after awaits | Passed |
| Final focused Pane, including beyond eight | Manager `:129–137` retains `focusEditorGroup` plus reveal; core focus helper unchanged | Passed |
| No move/cycle/untitled machinery | Removed placement scheduler and its cleanup branch; search of open-tab and manager finds no `moveActiveEditor`, `openPaneInGroup`, fill-before-drain or placement placeholder | Passed |
| Existing identity/lifecycle owner remains authoritative | `closePanes`, `handleSurfaceClosed`, synthetic binding reconciliation, surface factory and single-Pane opening remain unchanged; placement never imports sessions or stores cell state | Passed |

## Test changes

All tests run through the real feature, manager, surfaces, VS Code editor groups and Terminals, with fake external Herdr clients. Expectations are literal rather than derived from placement logic.

- `recreates a lone misplaced Pane Editor in its assigned cell` (`test/extension/tab-layout.test.ts:95`): old C closes, new C occupies cell three; literal mixed shape and tabs.
- `recreates both misplaced Pane Editors in a two-Pane swap` (`:109`): old A/B close; new Terminals in literal `[A]|[B]`.
- `recreates disjoint swaps and the Pane displaced by their closing groups while retaining the file` (`:124`): A/B/C/D close, then shifted E closes; file stays in now-first group. Literal final tabs are `[[keep.txt,A],[B],[C],[D],[E],[F],[G],[H],[I]]`, per architect explanation.
- `recreates a misplaced Pane Editor from inactive cell nine and focuses its retained Pane Editor` (`:176`): A recreates, I retains its Terminal; group nine/I ends focused.
- `switches from real Tab 13 to Tab 12 while retaining the other Tab's Pane Editors behind it` (`:200`): retained regression passes unchanged, including both Tab 13 Terminal references, literal tabs, 2×2 shape, and cell-three/p6A focus.
- `returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13` (`:226`): old p6A/p6B close on second click and recreate on third; p69/p6C retain identity throughout; p6D/p6E remain behind Tab 12 with their original Terminals. Literal intermediate/final tabs, shape and focus.
- Harness `:369–444`: tracks each created Terminal and its Pane ID, an explicit scenario-owned expected-closure set, exact closure/live-terminal outcomes, unique live Terminal per Pane, one Tab per live Pane, requested active tabs, and the existing maximum-one-live-client assertion.

No new test files or fixture changes were needed. Unrelated reconnect-screen placeholders in `PaneTerminalSurface`/`paneTarget` remain intentionally untouched: those are not placement's removed untitled editor.

## Validation evidence

1. `npm run build && npx vscode-test --config .vscode-test.mjs --label extension --grep 'Tab layout projection'`: exit 0, 22 passed; `/tmp/sol-identity-focused.log`.
2. `npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension`: exit 0 throughout; `/tmp/sol-identity-static.log`, `/tmp/sol-identity-unit.log`, `/tmp/sol-identity-extension.log`. Extension totals at lines 350, 526, 707; all three windows exited 0. The documented local keyboard-focus limitation did not occur in this run.
3. `git diff --check`: exit 0 after full validation.

An initial lint run rejected numeric/ViewColumn comparisons; typed ViewColumn locals fixed them before the passing runs. No failing checks remain. Generated bundles were rebuilt normally; no diagnostic instrumentation was introduced. Final diff inspection confirmed production changes are limited to the three owned source files. Existing uncommitted architecture/progress, fixture and regression changes were preserved.

## Domain/decision handoff

New domain terms: none; no `CONTEXT.md` additions proposed. The implemented hard-to-reverse trade-off is the already-approved loss of Terminal/client identity for displaced Pane Editors to avoid VS Code's hidden-merge orphaning. Proposed coordinator ADR 0017 entry: “Close displaced Pane Editors through their bound Tabs before whole-grid projection, then recreate them directly in target cells; preserve settled correctly placed and retained other-Tab editors. Pre-layout closures may shift groups and require further requested-editor closures; Herdr Panes themselves remain untouched.” The owner has already approved recreation, and the architect explained the finite closure preparation; documentation remains outside this worker's write boundary and awaits coordinator confirmation.

Continuation: `sol-identity`, this pi conversation, request `requests/sol-identity-1.md`; clarification `answers/sol-identity-q1.md`. Advisory multi-agent final review is left to the coordinator; this bounded worker did not delegate implementation or review.

<!-- end of reply -->
