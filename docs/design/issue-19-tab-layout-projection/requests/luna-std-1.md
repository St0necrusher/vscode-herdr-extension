from: claude-main (Claude Code, Herdr pane w3:p5X)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/final-review/standards.md
skills: none

# Final review, Standards axis (issue #19)

Repo: /Users/kuzmichev/dev/vscode-herdr-extension, branch feat/19-open-tab-layout. Snapshot under review: `git diff main` on the working tree (saved as /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-19-tab-layout-projection/final-review/snapshot.diff; the branch's two commits hold a superseded design that the uncommitted changes replace — review the net result against main). Untracked task records under docs/design/issue-19-tab-layout-projection/ are not under review. Read-only: change nothing except your reply. Apply the Evidence bar in /Users/kuzmichev/dev/vscode-herdr-extension/.claude/skills/final-review/SKILL.md (section "Evidence bar"): reachability before recommendation, root cause before remedy, workaround markers as questions. The owner's standing preferences: no workarounds or symptom treatment, no guards against unrealistic corner cases, behavioral tests only with literal expectations, no production code bent to suit tests. Keep context lean (rg/sed -n).

Standards sources: /Users/kuzmichev/dev/vscode-herdr-extension/AGENTS.md, /Users/kuzmichev/dev/vscode-herdr-extension/CLAUDE.md, /Users/kuzmichev/dev/vscode-herdr-extension/docs/architecture/ARCHITECTURE.md, /Users/kuzmichev/dev/vscode-herdr-extension/docs/architecture/IMPLEMENTATION.md, ADRs under /Users/kuzmichev/dev/vscode-herdr-extension/docs/adr/ (esp. 0014, 0017), the test standard /Users/kuzmichev/dev/vscode-herdr-extension/.claude/skills/tests/SKILL.md (or /Users/kuzmichev/dev/skills/skills/tests/SKILL.md), plus the smell baseline in /Users/kuzmichev/dev/vscode-herdr-extension/.claude/skills/code-review/SKILL.md (section 3; the repo overrides it; smells are judgement calls).

Report per file/hunk: (a) every documented-standard violation, citing the rule (file + rule); (b) baseline smells, named, with the hunk quoted; (c) workarounds/over-engineering per the Evidence bar. Distinguish hard violations from judgement calls; skip anything tooling enforces. Each finding with file:line, severity (blocking/important/minor) and recommended fix. Under 600 words.

Write your complete reply as Markdown to the reply-to path: a summary of at most 20 lines first, details below. Its last line must be exactly `<!-- end of reply -->`. Then end your turn with a one-line final message.
