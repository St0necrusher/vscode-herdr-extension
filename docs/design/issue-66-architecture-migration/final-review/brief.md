# Final advisory review of #66

You are one of two independent reviewers of the whole branch `refactor/66-architecture-migration` in the worktree `/Users/kuzmichev/dev/vscode-herdr-extension-66`. Read-only: edit no file except your own findings file; run no state-changing git command; do not ask interactive questions. The coordinator is the Claude session `claude-migration` (Herdr pane `w3:p4G`).

**Scope (fixed snapshot):** `git diff origin/main...HEAD` at HEAD `87215c2`. Everything is committed; there are no uncommitted changes in scope. Ignore `docs/design/` except as context.

**Context:** issue #66 (`gh issue view 66`): a behavior-preserving move to core/api/modules/features/views. Rules: `docs/architecture/ARCHITECTURE.md`, `docs/architecture/IMPLEMENTATION.md`, ADRs 0014/0015, `CONTEXT.md`. Decisions made during the migration (they override the issue table): D1–D19 in `docs/design/issue-66-architecture-migration/progress.md`, with `answers/*.md`. Slice records: `briefs/`, `reports/`, `reviews/`. Read excerpts with `rg` and `sed -n`; do not `cat` many files.

**Your axis** is named in your prompt:
- **Standards:** project rules, the accepted architecture (§1 import table, peer rule, §3 block shape and in-block directions, §4 per-layer rules, §6 naming, §7 guardrails), IMPLEMENTATION.md (state owners, lifecycle, async, tests), maintainability, and the user's preferences: no defensive over-engineering (no flags, impossible corner cases, compensating checks), behavioral tests that survive refactoring, no tests of helpers.
- **Spec:** missing, incorrect or extra behavior against #66: behavior unchanged (compare moved code and every command, view, status bar, lifecycle path against `origin/main`), `package.json` commands/views/menus unchanged, tests keep their assertions except D3/D6/D14 changes, and each "Done when" bullet.

**Evidence bar.** Report a finding only with a traced reachability: the real entry point, callers, state provenance, lifecycle or event ordering, existing guards, and the observable failure, with file:line on both `origin/main` and HEAD when behavior is claimed to differ. A hypothetical caller, impossible state or imagined future consumer is not a defect. If reachability is unresolved, say what evidence is missing. For each confirmed problem, name the owner that should enforce the invariant and the smallest fix at that layer.

**Output:** write `docs/design/issue-66-architecture-migration/final-review/<axis>.md` (axis = standards or spec): a summary of at most 15 lines, then numbered findings, each with: classification (confirmed defect / risk / optional improvement / scope expansion), severity (blocking / important / minor), evidence (file:line, trace), and recommended fix. End with a final message containing the summary.
