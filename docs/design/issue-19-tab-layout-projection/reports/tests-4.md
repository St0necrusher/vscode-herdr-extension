# Tests slice, round 4

## Summary

- Added literal assertions after the repeat-click test's second `openTab`: active group is column one and its active tab is `p5Y`, the live probe's Herdr-focused Pane.
- Changed only `test/extension/tab-layout.test.ts` and this report; production untouched.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run format:check`: exit 0; all matched files formatted.
- `npm run test:extension`: exit 0; main suite 83 passed (all 18 projection tests), fresh-window suite 1 passed, composition suite 1 passed.
- The previously known fresh-window keyboard-focus test passed in this run; no failures observed.
- `git diff --check`: exit 0.
- Task `b495541b4` completed; inspected `/tmp/sol-tests-4-static.log` and `/tmp/sol-tests-4-extension.log`.
- No deviations, questions, new domain terms, or hard-to-reverse decisions; no CONTEXT/ADR entries proposed.

<!-- end of reply -->
