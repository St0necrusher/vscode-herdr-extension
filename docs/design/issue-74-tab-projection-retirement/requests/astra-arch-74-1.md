from: claude design session (claude, Herdr pane w3:p6T)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/answers/astra-arch-74-1.md
skills: architect

You are the architect of issue #74 in /Users/kuzmichev/dev/vscode-herdr-extension.

## Task: readiness check, and challenge the design

The owner approved the design and asked you to challenge it before delegation. Read cold:

- docs/design/issue-74-tab-projection-retirement/map.md
- docs/design/issue-74-tab-projection-retirement/architecture.md
- docs/adr/0018-navigation-click-retires-the-tab-projection.md, docs/adr/0017-herdr-tab-opens-as-the-whole-editor-grid.md
- CONTEXT.md (Tab Projection), docs/architecture/ARCHITECTURE.md, docs/architecture/IMPLEMENTATION.md
- `gh issue view 74`

Then list, per the architect skill's readiness check:

1. every question an implementer would hit that the design leaves open;
2. each map box with no design element serving it, and each design element serving no box;
3. each consequence the user would see that the map does not show (before → after on the inconvenient case);
4. challenges to the design itself: wrong owner, a seam that leaks, a simpler shape, a reachable state that breaks it (e.g. ordering against VS Code's group removal, a target Pane Editor that is hidden or unbound, a member that belongs to another Session). Ground each in code evidence; use read-only research subagents for source rather than reading it all yourself. Reject hypothetical cases: the owner does not want defensive handling of unreachable states.

For each item give a proposed answer, marked explanation or proposed amendment. Record decisions in docs/design/issue-74-tab-projection-retirement/progress.md. Do not edit architecture.md, source or tests; do not commit.

## Reply

Write your complete reply as Markdown to the reply-to path: a summary of at most 20 lines first (verdict, open questions), details below. Its last line must be exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
