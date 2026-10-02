# Implementation brief — issue #47 (Run package.json scripts in Herdr)

You are the **implementation coordinator** for issue #47. You were dispatched by the Claude session `vscode-herdr-extension-31` (Herdr pane `w3:p27`). The user (they/them) is going to talk to you directly in your tab and settle the remaining details with you. Chat with the user in Russian. Code, docs, and commit messages are in English.

## Read first

- `CLAUDE.md`, `CONTEXT.md`, `docs/architecture/code-architecture.md` (the architecture authority).
- **Approved design:** `docs/design/issue-47-run-npm-scripts/architecture.md`. It covers the scope, the Herdr facts, modules, data flow, seams, the file structure, accepted decisions 1–6, and the verification plan.
- Herdr evidence: `docs/design/issue-47-run-npm-scripts/research-herdr-pane-run.md`.
- VS Code npm facts: `docs/research/issue-39-vscode-terminals-and-npm-scripts.md`, especially §1.1–1.2, §2, and §3.
- Requirements: `gh issue view 47` and the parent spec `gh issue view 39`. ADR 0008.
- Precedent to mirror: the #17 creation flow.
  - `src/features/navigation/panes/PanesFeature.ts` (`createAndOpenPane`)
  - `src/features/navigation/spaces/SpacesFeature.ts`
  - `docs/design/issue-17-create-spaces-panes/`
- User preferences: no defensive over-engineering. That means no flag soup, no checks for impossible states, and no speculative fallbacks beyond what the design names.

## Decisions already made (do not reopen unless the user does)

1. The command runs through `pane.send_input {pane_id, text: <command line>, keys: ["Enter"]}`, exactly as `herdr pane run` sends it. Herdr has no `pane.run` socket method (0.9.0–0.9.3, protocol 22).
2. `npm.runSilent` is ignored.
3. Script names use POSIX single quotes, applied only when the name has characters outside `[A-Za-z0-9_./:@%+=,-]`. The runner is never quoted.
4. If `runCommand` fails, show an error, keep the Tab, and do not open the Pane Editor.
5. `jsonc-parser` becomes an explicit runtime dependency for the hover.
6. Two hidden commands:
   - `herdr.runNpmScript` takes the NPM Scripts view element. It is offered inline and in the context menu (`view == npm && viewItem == script`), with `enablement: herdr.paneActionsEnabled`.
   - `herdr.runNpmScriptFromHover` takes `{script, documentUri}`.

Also settled:

- The feature is a new Navigation child, `src/features/navigation/scripts/`, composed by `NavigationFeature` with the Navigation context, `ActiveSessionCreation`, and `PanesFeature` as `NavigationPaneOpening`.
- `ActiveSessionCreation.createPane` gains optional `cwd` and `label`. It also gains `runCommand`, which uses the same active-Session guard and does not wait for a snapshot.
- The New Pane request params stay unchanged.

## Workflow

1. Before editing, create a branch from current `main`, for example `issue-47-run-npm-scripts`. `main` is protected.
2. Discuss with the user whatever they want to settle. Then implement. The change is small enough that you may implement it yourself. If you and the user decide to split it into slices for workers, follow `.claude/skills/delegating-slices.md`.
3. Write the shared seams (capability types) first, then the socket, Sessions, the feature, and finally the manifest and composition.
4. Run `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test`. Run `npm run test:extension` once at the end.
5. **Tests:** do not write new tests unless the user explicitly approves the scenarios with you. The plan in `architecture.md` is preliminary, and test authoring is a separate phase. Keep the existing tests passing. If an existing fake has to satisfy the widened `ActiveSessionCreation`, a minimal compile fix is fine.

## Boundaries

- Change only the files listed in the design's "Expected file structure", plus `package-lock.json`. The exceptions are minimal compile fixes in existing tests and fakes.
- **Do not edit** `docs/design/issue-47-run-npm-scripts/architecture.md` or the other design artifacts. Propose amendments in your report. Ask the user about anything that changes behavior, public contracts, or module boundaries.
- Do not commit, push, open a PR, or close the issue unless the user explicitly asks you to in your tab.

## Final report

When the user says the work is ready, or you are blocked, send **one** message with `SendMessage` to `vscode-herdr-extension-31`, then stop. Send no intermediate updates. Include:

- the branch and the changed files with their responsibilities;
- how each acceptance criterion of #47 is met, or why it is not;
- deviations from the approved design and the decisions agreed with the user (as amendments for me to record);
- the validation commands and their results, including anything unrun and why;
- open questions and risks.
