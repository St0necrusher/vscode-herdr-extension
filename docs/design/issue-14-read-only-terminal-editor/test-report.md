# Issue #14 — test and acceptance report

**Status:** critical automated scenarios completed and parent-verified on 2026-09-23.

## Added coverage

- `test/integration/terminal-surfaces/TerminalSurface.test.ts` — 8 behavioral lifecycle scenarios: dimensions/read-only input, bounded retry, inactive-Session pause/resume, fresh absence without rebind, full-frame reconnect reset, fault/reopen, user close, and extension disposal.
- `test/integration/herdr-cli/HerdrCliTerminalObserverFactory.test.ts` — 7 controlled subprocess scenarios: named/default CLI targeting, fragmented NDJSON, ANSI/base64, split UTF-8, additive records, malformed JSON/known records, `terminal.closed` with exit 0, unexpected EOF, and child cleanup.
- `test/extension/terminal-surfaces.test.ts` — 2 Extension Host scenarios: current connected/stale Pane command resolution and one continuous Panes-command → `TerminalSurfacesFeature` → native editor open/focus/reuse/detach path.
- `test/fixtures/terminal-observer/observer-fixture` is an isolated executable fixture; workspace settings point activation at a deliberately nonexistent Herdr executable. No real Session or Pane is contacted.

This adds 15 Vitest cases and 2 Extension Host cases. Totals are 68 Vitest tests across 9 files and 8 Extension Host tests.

## Review correction

The independent Spec reviewer found that the initial host tests proved the Panes command and native terminal behavior separately but did not execute their handoff in one scenario. The user authorized a test-only correction. The existing native-editor test now invokes the real `PanesFeature` command with a real `TerminalSurfacesFeature`; no production or architecture change was required.

## Parent validation

Final parent-run command:

```text
npm run typecheck && npm run lint && npm run format:check && npm run build && npm test && npm run test:extension && git diff --check
```

Outcome: exit 0. Vitest: 68/68. Extension Host: 8/8, including the corrected continuous Panes-command path.

## Deliberate limits

No real Herdr restart, Pane mutation, Agent lifecycle, control/takeover, Tab-follow or terminal-buffer pixel inspection is part of this slice. ANSI/Unicode/reset are verified through the controlled CLI and lifecycle seams; native VS Code creation/focus/reuse/detach is verified in the host. Manual review against a disposable real Pane remains useful but is not an automated acceptance blocker.
