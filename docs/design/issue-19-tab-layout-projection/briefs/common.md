# Common rules for the #19 workers

Read this file and your slice brief (`briefs/production.md` or `briefs/tests.md`). The approved design is `architecture.md` in this directory (call the directory TD); it is authoritative. Do not re-open its decisions. Skill: `implement-slice` (and `tests` for the tests slice, named in its brief).

## Write boundary

You write only the files your slice brief lists as owned, plus your report and any request file under TD. A change you need anywhere else (another source file, the fixtures, `esbuild.mjs`, a doc) goes into the report's Questions/Needed-changes section with evidence; you do not make it. Never edit `TD/architecture.md`, `TD/progress.md`, ADRs, `CONTEXT.md`. No commits, no pushes, no branch changes.

## Reading economy

Read excerpts (`rg -n`, `sed -n 'a,bp'`), not whole files, except the files you own. Do not read `research/` unless your brief points to a file there.

## Repository standards that bind

From `docs/architecture/ARCHITECTURE.md` (read §1, §4 `modules`/`features`, §5 if unsure) and `docs/architecture/IMPLEMENTATION.md`:

- Layers: `core` < `api` < `modules` < `features` < `views` < `extension`. "The peer rule forbids imports between two blocks of `modules/`, `features/`, or `views/`, also through re-exports." `modules/pane-editors` must not import `modules/sessions`; the feature imports both.
- "Another block is reached through its `index.ts` and the layer alias (`@core/…`, `@api/…`, `@modules/…`, `@features/…`, `@views/…`). Inside a block, imports are relative." Public exports go through the block `index.ts`; "never something for tests only".
- "Tests never justify a production export, a facade, or an adapter." "Derived state is computed, never copied into another mutable store."
- Classes for long-lived identity/state/lifecycle; standalone functions for stateless transformations; TypeScript `private`, not `#`.
- "`async`/`await` for Promise-returning flow. When an operation can complete after its owner was replaced or disposed, check that it is still current before changing state or causing further effects."
- Errors shown to the user are formatted with `errorMessage` from `@core/errors`; no `String(error)`, no `error.message` by hand.
- No type casts (`as X`, `<X>value`, non-null `!`) and no `any`; narrow with checks. Follow the lint rules in `eslint.config.mjs` (`no-restricted-syntax`, `no-restricted-imports`).
- Files: `PascalCase.ts` when the main export is a class, `camelCase.ts` otherwise. Tests sit beside their file as `*.test.ts` (extension tests under `test/extension/`).
- Docs, comments, commit-ish text in English. Comments only where the why is non-obvious.

## Owner's standing preferences

- No workarounds or symptom treatment: fix the cause at its owner.
- No guards against unrealistic corner cases; no impossible-case branches; no flag soup (boolean options that switch behaviour); no fallback for the design's exclusions (auxiliary windows, locked groups, user input races).
- No production code bent to suit tests (no test-only exports, hooks, or seams).
- Behavioral tests only: observable state and effects at the narrowest practical seam; no unit tests of private helpers; literal expectations (spell out the expected shape, titles, counts; do not recompute them with the code under test).
- If the design appears to contradict the code or itself, ask (below); do not improvise a different design.

## Validation

Run in the foreground, from the repo root:

`npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension`

Report each command's exact result. The fresh-window keyboard-focus extension test fails locally because the test window has no OS focus (it passes in CI): report it, do not chase it. Run `npx prettier --write` only on files you own.

## Questions

Ask the architect directly (name `astra-arch`, Herdr pane w3:p64). Write `TD/requests/<worker>-q<n>.md` (<worker> = your tab name, `sol-impl2`; n counts from 1):

```
from: <worker> (pi, Herdr pane <your pane>)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/answers/<worker>-q<n>.md
skills: architect

<the question, the evidence (file:line, quoted design lines), your proposed answer>
```

then run, in the foreground:

`/Users/kuzmichev/.claude/skills/multi-agent-delegate/scripts/wait-report astra-arch <reply path> --prompt "Request <worker>-q<n> from <worker> (pi, Herdr pane <your pane>): read <request file> and do what it asks."`

Continue from the reply. A question the architect cannot settle goes into the report's Questions section with evidence and your proposed answer. No interactive prompts to anyone.

## Report

Write `TD/reports/<slice>-<round>.md` (round 1 for the first pass): a summary of at most 20 lines first (status, checks with exact results, deviations from the design, questions), details below (files changed, what each requirement became, failing tests with names). The last line is exactly `<!-- end of reply -->`. Then end your turn with a one-line message.
