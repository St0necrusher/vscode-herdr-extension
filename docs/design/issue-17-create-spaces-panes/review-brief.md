# Advisory review brief: issue #17

You are an independent reviewer. You read and report; you do not edit any file.

## Scope

All uncommitted changes on branch `feat/issue-17-create-spaces-panes` relative to `HEAD` (af79234):

- `git diff HEAD`;
- the untracked file `src/capabilities/sessions/creation.ts`.

The design docs in `docs/design/issue-17-create-spaces-panes/` are context, not review targets.

## Axis

Your prompt names one of two axes:

- **Standards:** compliance with `docs/architecture/code-architecture.md`, the domain language in `CONTEXT.md`, the ADRs in `docs/adr/`, and maintainability. Ownership, capability placement, View vs Feature responsibilities, lifecycle, and no defensive over-engineering.
- **Spec:** missing, incorrect or extra behavior against issue #17 (`gh issue view 17`) and the approved design in `docs/design/issue-17-create-spaces-panes/architecture.md`, decisions D1–D4. New tests are deliberately out of scope; do not report missing tests.

## Evidence bar

- **Reachability:** for every finding, trace the real entry point, callers, state and event ordering, and existing guards through to the observable failure, citing `file:line`. A hypothetical caller, an impossible state or an imagined future consumer is not a defect. If reachability is unresolved, say what evidence is missing.
- **Root cause:** for a confirmed problem, name the owner that should enforce the invariant and the smallest correction at that layer. Do not propose a consumer-side guard that only masks the symptom.

## Output

End with a final message listing the findings. For each one give:
- axis;
- classification: confirmed defect, risk, optional improvement, scope expansion or false positive;
- severity: blocking, important or minor;
- `file:line`;
- the trace;
- the proposed remedy.

If there are no findings, say so.
