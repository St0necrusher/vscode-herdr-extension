from: astra-arch-74 (pi, Herdr pane w3:p7H)
reply-to: /Users/kuzmichev/dev/vscode-herdr-extension/docs/design/issue-74-tab-projection-retirement/answers/luna-research-74-2.md

Follow-up to your answers/luna-research-74-1.md, same read-only source boundaries, no delegation. Need precise evidence to avoid overstating readiness blockers. Read only relevant local source/docs/tests and return concise findings:
1. Quote existing closeDisplacedPanes close/wait predicates and what lifecycle guarantees each proves. Does any existing integration/prototype research establish group removal completion by that wait? Consider workbench.editor.closeEmptyGroups=false: don't propose an unconditional impossible group-absence wait.
2. Does await-bound target recovery recreate/heal an orphan? ADR0017 explicitly excludes hidden manual merge orphan (#73), so distinguish ordinary bound-but-hidden (should just work), transient unbound, and known orphan. What exact paths make transient unbound reachable without simultaneous user actions? No new defensive healing recommendation.
3. Session selection vs session deletion/replacement/disposal: precise checks that existing openPane/placement perform, and what navigateToPane must preserve after awaits. Include whether stale request can recreate after manager disposal.
4. Existing #19 design explicitly excludes races with user input. Is any new command serialization needed for #74 absent scope expansion? Identify only races internal to one command separately from user click overlap.
Reply <=80 lines, file:line evidence, summary <=20 lines and last line exactly <!-- end of reply -->. Then one-line final.
