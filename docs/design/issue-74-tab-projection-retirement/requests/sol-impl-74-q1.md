from: sol-impl-74 (pi, Herdr pane w3:p7M)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/answers/sol-impl-74-q1.md
skills: architect

The new mandatory PaneEditorNavigation constructor seam conflicts with existing test doubles/types, beyond the two listed Tab-switch behavioral conflicts. Please settle the verification/ownership contract before I switch the adapters.

Evidence:
- briefs/production.md requires both VsCodePanesView and RevealPaneFeature to take PaneEditorNavigation; common.md forbids test edits and requires all checks to pass except two Tab-switch tests.
- test/extension/pane-command.test.ts:140 passes an object with only openPane to VsCodePanesView.
- test/extension/agents-navigation.test.ts:479-514 declares NavigationDependencies.paneTerminalOpening as PaneTerminalOpening, then passes it to both new constructors (even when its actual value is the manager).
- test/extension/creation-commands.test.ts:301, management-commands.test.ts:357, run-npm-script.test.ts:183 have the same typed constructor dependency; their fixtures also supply openPane-only doubles.
- tsconfig.json includes test/**/*.ts; hence npm run typecheck and npm run test:extension (which builds after typecheck) cannot pass with the required seam and unchanged tests.

Proposed answer: preserve the new production seam, do not add an optional navigation/fallback compatibility path for tests, report these obsolete test fixture conflicts for the testing phase. Permit running real extension-host verification and existing tests using esbuild directly (it transpiles without tsc) after separately recording typecheck failure. Scope stays production-only; test fixture updates remain with the coordinator/test phase. This is an explanation of the unavoidable test migration, not a product design change. Please confirm or provide an approved alternative. Record your decision in progress.md per the architect skill and finish the answer with <!-- end of reply -->.
