# Fixtures slice — round 1

- **Status:** complete; validation passes except the three failures explicitly permitted by the slice brief.
- **Checks:** `npm run typecheck`, `npm run lint`, `npm run format:check` passed.
- **Checks:** `npm test` — 16 files passed, 158 tests passed.
- **Extension checks:** 85 passed, 2 expected Tab Projection conflicts failed; composition 1/1 passed.
- **Baseline:** fresh-window suite 0/1; `takes keyboard focus from the Panes View` failed as documented.
- **Scenarios:** fixture migration only; no new tests or scenarios. Pane-command routing assertions retained.
- **Defects:** none found. **Deviations:** none.
- **Questions:** none.

## Changes

Updated the navigation fixtures to pass the required `PaneEditorNavigation` separately from `PaneTerminalOpening` in the five owned test files:

- `test/extension/agents-navigation.test.ts`: `NavigationDependencies` now has `paneEditorNavigation`; the real `PaneTerminalSurfaceManager` is passed as both the terminal opener and navigation implementation. `VsCodePanesView` and `RevealPaneFeature` receive the navigation dependency; creation and script features retain `paneTerminalOpening`.
- `test/extension/creation-commands.test.ts`, `test/extension/management-commands.test.ts`, and `test/extension/run-npm-script.test.ts`: added a typed unused navigation double that rejects with `unexpected navigation in this fixture`. The adapters catch the rejection and send `Could not open Pane: unexpected navigation in this fixture` to `showErrorMessage`. These suites capture that error; their successful feature-flow assertions check the error list is empty. This is not a fail-fast guarantee for every test.
- `test/extension/pane-command.test.ts`: replaced the obsolete `{ openPane }` dependency with a typed `PaneEditorNavigation` double. It records each request and returns a resolved Promise. Existing routing/request assertions are unchanged, including their await behavior.

## Diagnostic-site mapping

The reported locations refer to the pre-change lines from the slice brief:

- `agents-navigation.test.ts:493,514`: `VsCodePanesView` and `RevealPaneFeature` now receive `dependencies.paneEditorNavigation`; the manager is supplied for both dependencies at the fixture call site (now line 439).
- `creation-commands.test.ts:313,334`, `management-commands.test.ts:369,390`, `run-npm-script.test.ts:195,216`: both navigation constructors now receive the typed rejecting double. The existing `paneTerminalOpening` remains wired to the creation and Run npm Script features.
- `pane-command.test.ts:140`: the `openPane` literal was replaced with `navigateToPane`, which records the typed request and returns `Promise.resolve()`; this also restores contextual typing at the former `request` callback and removes its consequential unsafe-argument lint error.

## Validation details

- `npx prettier --write` on the five owned files: all unchanged.
- `git diff --check` on the five owned files: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed; all matched files use Prettier style.
- `npm test`: 16 test files passed; 158 tests passed.
- `npm run test:extension`: its build/typecheck passed. Extension-host tests: 85 passed, 2 failed:
  - `switches from real Tab 13 to Tab 12 while retaining the other Tab's Pane Editors behind it`
  - `returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13`

  Both are the approved D5 conflicts assigned to the following `tab-projection` slice. The fresh-window run had 0 passing and 1 failing: `takes keyboard focus from the Panes View`, the documented local baseline failure. Real Herdr extension composition passed 1/1. No other extension failures were reported.

This slice adds no domain terms or hard-to-reverse decisions; no `CONTEXT.md` or ADR proposal is needed. The three expected extension failures are reported, not changed here. No production files, tests outside the owned list, or domain documents were edited. No commit was made.
<!-- end of reply -->