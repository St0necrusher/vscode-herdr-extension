# Final review round — issue #19

Baseline: `main`. Scope: `git diff main` on the working tree (saved during review, not kept), branch commits 52af907 and 4c70c74 plus the uncommitted whole-grid change. Reports: `standards.md` (luna max), `spec.md` (luna max), `intent.md` (Opus high, architect consulted: `answers-1.md`, `answers-2.md`).

## Triage

| # | Axis | Finding | Classification | Severity | Action |
|---|---|---|---|---|---|
| S1 | Spec | Repeat-click test does not assert final focus | confirmed coverage gap | minor | fix (tests worker) |
| I1 | Intent | PR #72 title/body describe the superseded policy | confirmed leftover | important | coordinator rewrites the PR text; branch commits rewritten into clean commits before push |
| I2 | Intent | Late ADR 0013 reveal in a fresh window might take the final focus | risk, unproven | minor | no change; `Terminal.show` opens with `EditorActivation.PRESERVE` (`research/group-activation.md`), so the group is unlikely to change; noted in the PR |
| I3 | Intent | `openPaneSurface` comment lost its reason | optional improvement | minor | fix (restore the reason) |
| I4 | Intent | Throws for impossible states (`Missing editor group focus command`, `Missing misplaced Pane Editor`) | optional improvement (owner's no-impossible-guards rule) | minor | fix where the types allow readable narrowing |
| I5 | Intent | Placeholder never closed if its tab lookup times out | risk, unproven | minor | no change |
| I6–I8, Std-Q | Intent/Standards | cleanup outside `finally`; swallowed cleanup error; `terminal.show(true)` past `reveal()` | false positive | — | none |
