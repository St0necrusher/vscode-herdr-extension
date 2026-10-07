# Common brief for #66 workers

You implement one slice of issue #66: move the code to the core/api/modules/features/views architecture without changing behavior. Your slice brief names the slice, your worktree, the files you own and what is done. This file holds the rules every slice shares.

The coordinator is the Claude session `claude-migration` (Herdr pane `w3:p4G`). It reviews your diff, answers your questions and commits. You are not talking to the user.

## Read first

- `gh issue view 66`: goal, target structure, where today's code goes, constraints.
- `docs/architecture/ARCHITECTURE.md` and `docs/architecture/IMPLEMENTATION.md`: the rules. They decide placement.
- `docs/adr/0014-*.md`, `docs/adr/0015-*.md`, `CONTEXT.md` for domain terms.
- `docs/design/issue-66-architecture-migration/progress.md`: the D-decisions made for this migration. They override the issue table where the two differ.
- `/Users/kuzmichev/dev/vscode-herdr-extension/.claude/skills/implement-slice/SKILL.md`: how to work a slice. One override: in this task tests are part of your slice as your slice brief says, so the rule "tests remain unchanged" there is replaced by the test rules below.

Read the source your slice touches. Do not read the whole repository. Read excerpts with `rg` and `sed -n`, not `cat` over many files.

## Rules

- Behavior does not change. `package.json` commands, views and menus do not change.
- Change only the files your slice brief lists as owned. If you need a change anywhere else, stop and put it in your final message.
- Match the surrounding code: naming, comment density, idioms. No defensive checks for cases that cannot happen, no flags, fallbacks or abstractions without a present need.
- Move files with plain `mv`. Do not run git commands that change state: no `git add`, `git mv`, `git commit`, `git stash`, `git checkout`, `git reset`, no push. The coordinator commits.
- Code, comments and docs are in English.

## Tests

- Tests keep their assertions. When a file moves, its test moves beside it; you change only imports and construction.
- Never weaken, delete, skip or loosen an assertion to make a move pass. If a test cannot keep its assertions, stop and report it with the reason.
- Do not add a production export, facade or adapter only for a test (`IMPLEMENTATION.md`, Tests). A test may import a file directly instead of through a public entry.

## Validation

Run `npm run typecheck`, `npm run lint`, `npm run format:check` and the tests your slice touches (`npx vitest run <paths>`; `npm run test:extension` when your slice brief says so). Run validation in the foreground, so your turn ends only when the result exists; do not leave checks running in a background job.

## Context budget

Keep your context under about 150k tokens: read excerpts, not whole large files you do not edit. If you approach the limit before you finish, stop, write what is done, what is left and the state of each owned file into your report, and end.

## Questions

Do not ask interactive questions; nobody answers them. When you hit a decision the rules and decisions do not settle, finish the work you can, then list each question in the report's `## Questions` section with its evidence (file:line) and your proposed answer.

## Report

Write your report to `docs/design/issue-66-architecture-migration/reports/<slice>.md`. It opens with a summary of at most 20 lines (status, checks, deviations, questions); details follow below. Put each question in a `## Questions` section with evidence (file:line) and your proposed answer. End with a final message containing the same text. The details cover:

- each done criterion and where it is satisfied, or why not;
- changed, moved and new files;
- checks run and their results, verbatim failures included;
- deviations from the brief, and questions for the coordinator.
