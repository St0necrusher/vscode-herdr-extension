# Slice `fixtures` (scenario 9): migrate navigation fixtures

Read `briefs/tests-common.md` first. Report: `TD/reports/fixtures-1.md`.

## Owned files

`test/extension/{agents-navigation,creation-commands,management-commands,run-npm-script,pane-command}.test.ts`. Fixture and dependency changes only: no new scenarios, no changed assertions except as stated for `pane-command`.

## Why

Production (`c989928`..`d9f7a7d`) added `PaneEditorNavigation { navigateToPane(request): Promise<void> }` (`src/modules/pane-editors/paneTerminalOpening.ts`, exported by the block `index.ts`). `VsCodePanesView` (3rd constructor argument, `src/views/sidebar/panes/VsCodePanesView.ts:46`) and `RevealPaneFeature` (3rd argument, `src/features/reveal-pane/RevealPaneFeature.ts:13`) now take it. Create Pane, Split, Create Space and Run npm Script keep `PaneTerminalOpening` (`openPane`), per D6. The fixtures no longer compile. Diagnostics (from `reports/production-3.md`; line numbers may have shifted):

- `agents-navigation.test.ts:493,514`, `creation-commands.test.ts:313,334`, `management-commands.test.ts:369,390`, `run-npm-script.test.ts:195,216`: TS2345, `PaneTerminalOpening` lacks `navigateToPane` (the `createNavigation` calls that pass `dependencies.paneTerminalOpening` to `VsCodePanesView` and `RevealPaneFeature`).
- `pane-command.test.ts:140`: TS2353 (the `{ openPane }` literal is not a `PaneEditorNavigation`) and TS7006 (`request` loses its contextual type); `pane-command.test.ts:141:25`: lint `no-unsafe-argument`, consequent.

## Required change

1. In each of the four `createNavigation` helpers: add `paneEditorNavigation: PaneEditorNavigation` to `NavigationDependencies`; pass it to `VsCodePanesView` and `RevealPaneFeature`; keep `dependencies.paneTerminalOpening` for `RunNpmScriptFeature`, `CreateSpaceFeature`, `CreatePaneFeature`. Import `PaneEditorNavigation` from `@modules/pane-editors` / the relative path the file already uses.
2. `agents-navigation.test.ts`: the real manager supplies both: `paneTerminalOpening: manager, paneEditorNavigation: manager` (call site near line 436).
3. `creation-commands`, `management-commands`, `run-npm-script` never navigate: give them a typed `PaneEditorNavigation` double that rejects with a descriptive error, e.g. `navigateToPane: () => Promise.reject(new Error("unexpected navigation in this fixture"))`. Caveat from the architect (`answers/claude-coord-74-q1.md`, Q4): the adapters catch navigation errors and show `Could not open Pane: <message>` through `vscode.window.showErrorMessage`, so the rejection does not fail a test by itself. These three suites already capture `showErrorMessage` into an error list; check whether it is asserted empty and, if so, say in the report that an unexpected navigation would surface there. If it is not asserted, do not add assertions; describe the double as a nonfunctional unused stub, not a fail-fast guarantee. No new mocking framework, no production fallback.
4. `pane-command.test.ts`: replace the `{ openPane }` literal (line ~140) with a `PaneEditorNavigation` double whose `navigateToPane` records the request (same `requests.push(request)` and a resolved Promise). Keep the existing routing assertions unchanged (`assert.deepEqual(requests, [...])`, the later `requests.at(-1)` checks and `expectRequestCount`): they must still prove that `herdr.openPane` reaches navigation with the intended request and the request awaited by the command.

## Done when

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` pass.
- `npm run test:extension` passes except: the two `tab-layout.test.ts` conflicts with D5 ("switches from real Tab 13 to Tab 12 while retaining the other Tab's Pane Editors behind it" and "returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13"), which the next slice rewrites, and the baseline fresh-window focus test. Any other failing test is a defect of your change or a production defect: fix it (fixture side) or report it with evidence.
- Report lists each diagnostic site and how it was fixed, and the exact counts.
