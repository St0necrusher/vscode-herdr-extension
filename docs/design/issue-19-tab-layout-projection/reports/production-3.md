# Production slice, round 3

## Summary

- Status: F3 and F4 addressed; neither impossible-state throw remains.
- No supported behaviour change, new validation, or creation-path restructuring.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run format:check`: exit 0; all matched files formatted.
- `npm test`: exit 0; 16 files / 156 tests passed.
- `npm run test:extension`: exit 0; main suite 83 passed, fresh-window suite 1 passed, composition suite 1 passed.
- The known fresh-window focus test passed in this run; no failures occurred.
- `git diff --check`: exit 0.
- Questions, blockers, and needed changes outside this slice: none.
- Long suites used the harness-required background runner instead of foreground; completed logs were inspected.

## Changes

- **F3 — comment:** `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:55` restores the reason: “A Visible Pane Editor in an inactive group is revealed so that it takes focus.” Comment only; existing/create paths are unchanged.
- **F4 — placement narrowing:** `PaneTerminalSurfaceManager.ts:97-138` drives the move loop with the destructured first misplaced binding (`while (first !== undefined)`), updating it after each live recomputation. This narrows the candidate directly and removes `Missing misplaced Pane Editor` without a new check or cast.
- **F4 — focus mapping:** `src/core/editor-groups/index.ts:3-25` replaces the indexed command array with a private switch returning a definite string: columns 1–7 map directly, and columns 8 onward start at Eighth. Existing sequential Next commands and the active-group wait are unchanged. `Missing editor group focus command` is removed without introducing caller validation.

Round 3 edited only those two owned production files and this report. Other workers' tests and staged ADR changes were preserved. No tests, public seams, lifecycle checks, docs/ADRs/CONTEXT, staging, commits, pushes, or branches were changed by this round.

## Validation

From the repository root, the static chain `npm run typecheck && npm run lint && npm run format:check && git diff --check` completed with exit 0. Prettier writes were restricted to the two owned files and this report.

Both test suites completed successfully:

- `/tmp/sol-impl2-round3-unit.log`: 16 files / 156 tests passed.
- `/tmp/sol-impl2-round3-extension.log`: VS Code 1.141.0; build/typecheck passed; main suite 83 passed, fresh-window suite 1 passed, composition suite 1 passed.
- Specifically, `The first Pane Editor of a window > takes keyboard focus from the Panes View` passed (348 ms), rather than exhibiting its known environment-dependent failure.
- Harness task `b25532470`: completed, exit 0. Combined output: `.pi/tasks/01a12495-10ea-76b3-b819-0d95cc0c6f51-87047/b25532470.output`.

No new domain terms or hard-to-reverse decisions; no CONTEXT/ADR additions proposed. Continuation: worker `sol-impl2`, current pi conversation, request `requests/sol-impl2-3.md`.

<!-- end of reply -->
