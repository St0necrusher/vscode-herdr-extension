# Common rules for the #74 test worker

Read this file and your slice brief (`briefs/fixtures.md` or `briefs/tab-projection.md`). Call the directory above this one TD. Authoritative sources: `TD/architecture.md` (readiness answers 1-10), `TD/map.md` (D1-D8, I1-I7), `docs/adr/0018-navigation-click-retires-the-tab-projection.md`, the "Tab Projection" entry in `CONTEXT.md`, and for scenario detail `TD/answers/claude-coord-74-q1.md` and the "Tests phase" section of `TD/progress.md`. Do not re-open decisions. Worker `luna-tests-74` (pi), skill `tests` (step 3 and the checks of step 4).

## Write boundary

You write only the test files your slice brief lists as owned, plus your report and request files under TD. Registering a new extension test file in `esbuild.mjs` is allowed only if a new file is created; prefer not to create one. Production code (`src/`) is read-only. Never edit `TD/architecture.md`, `TD/map.md`, `TD/progress.md`, ADRs, `CONTEXT.md`. No commits, no pushes, no branch changes.

If a test exposes a production defect or contradicts the approved behavior: stop that test and report it with evidence. Never work around it, change production code, or weaken the assertion.

## Test rules (skill `tests`, step 3)

- Write only the approved scenarios of your brief; no extras.
- Observable outcomes through public seams (editor groups and tabs, terminal identity and open/closed state, files, the real `manager.navigateToPane`, the real commands). No private-state assertions, no `as` casts, no collaborator call counts, no new production export or seam.
- Real internal components; fake only the Herdr session/clients as the existing harness does.
- Literal expectations taken from the decisions (map D1-D8, ADR 0018, this brief), never recomputed with the production algorithm.
- Test names use `CONTEXT.md` vocabulary (Tab Projection, Pane Editor, Pane, Tab, navigation click).
- No arbitrary sleeps or fixed delays: wait with bounded host-state waits such as `waitForEditorGroups` (`src/core/editor-groups`), reading group state only after the wait. Read tab counts after the close has settled.
- Repo standards: no `any`, no type casts, `private` not `#`, lint rules of `eslint.config.mjs`; docs and comments in English, comments only where the why is non-obvious.

## Validation

Foreground, from the repo root:

`npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension`

All must pass, except the baseline fresh-window test "takes keyboard focus from the Panes View" (fails locally without OS focus, also on the committed baseline; name it as baseline, do not investigate). Additional exceptions are in your slice brief. Report exact counts and failing test names per command. Run `npx prettier --write` only on files you own. The extension suite rebuilds `dist/`; run one suite at a time.

## Questions

Ask the architect directly (`astra-arch-74`, Herdr pane w3:p7H). Write `TD/requests/luna-tests-74-q<n>.md` (n counts from 1):

```
from: luna-tests-74 (pi, Herdr pane <your pane>)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/answers/luna-tests-74-q<n>.md
skills: architect

<the question, the evidence (file:line, quoted design lines), your proposed answer>
```

then run in the foreground:

`/Users/kuzmichev/.claude/skills/multi-agent-delegate/scripts/wait-report astra-arch-74 <reply path> --prompt "Request luna-tests-74-q<n> from luna-tests-74 (pi, Herdr pane <your pane>): read <request file> and do what it asks."`

Continue from the reply. What the architect cannot settle goes into the report's Questions section with evidence and your proposal. No interactive prompts to anyone.

## Report

Write `TD/reports/<slice>-<round>.md` (round 1 first). Summary of at most 20 lines first (status, check results with exact counts, scenarios done / gaps, production defects found, deviations, questions), details below (files changed, scenario-to-test map, failing tests by name). The last line is exactly `<!-- end of reply -->`. Then end your turn with a one-line message. No commits.
