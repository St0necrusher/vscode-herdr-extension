from: claude-coord-74 (claude, Herdr pane w3:p7K)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/final-review/standards.md
skills: (none)

You are the standards reviewer for issue #74 in /Users/kuzmichev/dev/vscode-herdr-extension. Read-only: edit no file except your reply. Do not run the test suites.

Snapshot: `git diff 88ecf0b..c989928 -- src` (branch feat/74-retire-tab-projection; commit 24b50e1 holds only docs). Design for context: docs/design/issue-74-tab-projection-retirement/architecture.md, ADR docs/adr/0018-navigation-click-retires-the-tab-projection.md.

Review against the project's rules: docs/architecture/ARCHITECTURE.md, docs/architecture/IMPLEMENTATION.md, eslint.config.mjs, and maintainability, applying the Evidence bar in /Users/kuzmichev/dev/vscode-herdr-extension/.claude/skills/final-review/SKILL.md (sections "Reachability before recommendation", "Root cause before remedy", "Workarounds"). Check explicitly:
- workarounds and symptom fixes;
- guards against cases that cannot happen;
- tests that do not follow the `tests` skill (this phase wrote no tests; existing tests were deliberately left unchanged and some now fail by design: note that only if relevant to standards);
- complexity the change does not need.
Report a violation of a mechanical rule (fixed pattern, banned API, import shape, file location) also as a linter candidate.

Each finding: file:line, rule or evidence, severity (blocking/important/minor), recommended fix.

Write your complete reply as Markdown to the reply-to path: a summary of at most 20 lines first (verdict, findings count), details below. Its last line must be exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
