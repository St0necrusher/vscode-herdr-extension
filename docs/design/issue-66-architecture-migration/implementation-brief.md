# Implementation brief: architecture migration (#66)

You are the **coordinator** of issue [#66](https://github.com/St0necrusher/vscode-herdr-extension/issues/66): move the code to the core/api/modules/features/views architecture without changing behavior. The user works with you directly in this tab and continues with you to the end; no report goes back to the session that dispatched you.

## First: talk to the user

Before you plan anything, ask the user what they want to agree with you. They have points of their own for this migration. Settle them, then go on.

## Sources

- Issue #66 (`gh issue view 66`): goal, target structure, where today's code goes, constraints, done criteria.
- [`docs/architecture/ARCHITECTURE.md`](../../architecture/ARCHITECTURE.md) and [`IMPLEMENTATION.md`](../../architecture/IMPLEMENTATION.md): the rules. They decide placement where the issue's table is only a starting point.
- ADRs [0014](../../adr/0014-herdr-is-the-api-layer-under-our-own-modules.md) and [0015](../../adr/0015-selected-session-decides-the-active-connection-for-now.md), and [`CONTEXT.md`](../../../CONTEXT.md) for domain terms.
- The current code under `src/` and its tests under `src/**/*.test.ts` and `test/`.

The architecture is decided; this task decides how to execute it. When the code contradicts a rule, or a rule turns out wrong for a real case, bring it to the user instead of bending the code or the rule silently. An accepted change to the rules is a docs edit in the same PR.

## Workflow

Follow `build` §3–5 (`.claude/skills/build/SKILL.md`) and [`delegating-slices.md`](../../../.claude/skills/delegating-slices.md), with these additions for this task:

- Present your execution plan (slices, order, owned files, who implements) to the user and start only after their explicit approval.
- The slices are mostly serial: most of them touch `src/extension/HerdrExtension.ts` and the consumers of `src/capabilities/`. Parallelize only slices with disjoint files.
- After each slice is integrated, run the full validation (`npm run lint`, `npm run format:check`, `npm test`, `npm run test:extension`) and commit that slice on its own.
- Review every worker diff yourself before accepting it, and send it back until each fix is actually done. Watch for test assertions weakened to make a move pass.

## Boundaries

- Work on branch `refactor/66-architecture-migration` in a worktree of your own, created from `origin/main`. Leave the main checkout alone.
- Do not merge. Open one PR that closes #66 when the user agrees the work is done.
- Issue #67 (TakeoverPluginRegistration after dispose) is a separate bug, outside this task.
