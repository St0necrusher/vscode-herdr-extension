# Recreate placement — round 2

- **Status: requested corrections complete; validation run once.**
- `PaneTerminalSurfaceManager.ts`: removed all five `requireCurrentSurface` calls, both added disposal checks, and the helper. `focusPane` matches HEAD again.
- Moved/reworded the batch-loop comment to explain group removal, shifting columns, and re-reading displacement.
- `paneTerminalPlacement.ts`: comment now explains VS Code orphaning terminal editors merged while hidden.
- Kept the authorized refused-closure error, bounded event waits, pre-layout closure fixed point, and existing `requireSurface` lookup.
- Tests, fixtures, feature, architecture, ADRs, and other workers' changes untouched this round.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run format:check`: exit 0.
- `npm test`: exit 0; 16 files / 158 tests passed.
- `npm run test:extension`: exit 1; main 87 passed; fresh-window 0 passed / 1 failed; composition 1 passed.
- Failure: `The first Pane Editor of a window — takes keyboard focus from the Panes View`, `Timed out waiting for the Pane Editor to report keyboard focus`.
- This matches the documented local OS-focus limitation in `briefs/common.md`; reported without changes or reruns, as instructed.
- Both real Tab 12/13 regressions and all four recreation scenarios passed in the main extension suite.
- `git diff --check`: exit 0; source search confirms no `requireCurrentSurface` or added `Pane Editors are disposed` checks remain.
- Logs: `/tmp/sol-identity-2-static.log`, `/tmp/sol-identity-2-unit.log`, `/tmp/sol-identity-2-extension.log` (main result :348; focus failure :527–538; composition :717).
- Deviations/questions: none. No new domain terms or hard-to-reverse decisions; no further CONTEXT/ADR proposal needed.
- No staging, commits, pushes, branch changes, or delegation.

<!-- end of reply -->
