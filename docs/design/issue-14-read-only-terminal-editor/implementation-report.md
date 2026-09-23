# Issue #14 — production implementation report

**Status:** production slice implemented and reconciled on 2026-09-23. Critical tests and Extension Host acceptance were subsequently authorized and completed; see [`test-report.md`](test-report.md).

## Implemented boundaries

- `PanesFeature` owns `herdr.openPane`, rereads current connected or stale `PanesModel` state, and calls the narrow `PaneTerminalOpening` capability.
- `TerminalSurfacesFeature` owns one editor per `(Session ID, terminal ID)` and each `TerminalSurface` owns observation/retry state.
- `HerdrCliTerminalObserverFactory` owns one supported CLI observation attempt, NDJSON/base64/UTF-8 parsing and child cleanup. Retry remains in the feature.
- `VsCodeTerminalSurfaceView` owns the transient editor-area Pseudoterminal, ANSI writes/reset, read-only/status display and host lifecycle/focus signals.
- `HerdrExtension` composes Sessions → TerminalSurfaces → Navigation and disposes in reverse order.

## Parent reconciliation

The parent inspected all production changes against the approved architecture and returned three corrections to the original worker:

1. opt out of VS Code terminal persistence with `isTransient: true`;
2. type `TerminalSurface` against a small consumer-owned View interface rather than a concrete host class;
3. combine active terminal identity with active editor-tab state, because `activeTerminal` alone also means “most recently had focus”.

The resumed worker implemented those corrections. The parent reread the resulting public seams, registry/lifecycle, host adapter, command wiring, observer parser and cleanup. No architecture amendment or remaining production discrepancy was identified.

## Validation evidence

Parent-run command:

```text
npm run typecheck && npm run lint && npm run format:check && npm run build && npm test && git diff --check
```

Outcome: exit 0.

- TypeScript typecheck passed (twice, including the build script).
- ESLint passed for `src` and existing `test`.
- Prettier check passed.
- Production and existing Extension Host test bundles built.
- Existing Vitest suite passed: 7 files, 53 tests.
- Diff whitespace check passed.
- No test source, fixture, snapshot, helper or test configuration was changed.

## Subsequent verification

The separately authorized test phase added controlled observer, lifecycle and Extension Host coverage. Final totals are 68 Vitest tests and 8 Extension Host tests; the full parent-run validation passed. See [`test-report.md`](test-report.md) and [`review-report.md`](review-report.md).

No staging, commit or push was performed.
