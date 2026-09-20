# Architecture record

Status: approved for implementation on 2026-09-19.

The accepted migration design is [`../feature-oriented-architecture-simplification.md`](../feature-oriented-architecture-simplification.md). The sole canonical architecture authority is [`../../architecture/code-architecture.md`](../../architecture/code-architecture.md). Issue #11 supplies the behavior that this migration must preserve.

Implementation must follow the accepted design's migration acceptance criteria and behavioral invariants. If the design inventory and canonical rules differ, the canonical rules win.

## Approved amendment: command ownership

On 2026-09-19 the user clarified that commands are always owned by the Feature, not by its View. Each owning `*Feature.ts` registers and disposes its commands directly. A command may invoke a View method when it requires presentation behavior, but the View does not own registration. This supersedes the command-registration wording in section D6 of the migration input and is reflected in the canonical architecture.

The user also decided that ESLint must not restrict `vscode` imports by path. Semantic host ownership remains an architecture and review rule, while lint continues to enforce dependency direction, public entries, sibling isolation, cycles, and production/test isolation.
