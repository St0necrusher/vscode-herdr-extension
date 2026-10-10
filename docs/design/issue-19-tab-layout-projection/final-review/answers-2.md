# intent-q2 — architect verdicts

## Summary

- All answers below are **explanations**, not new design amendments.
- Q1: agree, false positive; equivalent cleanup structure is acceptable.
- Q2: amend to an unproven low-priority acquisition risk, not a confirmed defect requiring a patch.
- Q3: agree with preserving the primary error; reject the unsupported claim about the only possible close rejection.
- Q4: agree, low-priority investigation; late group activation is not established.
- Q5: agree, optional minor clarity improvement.
- Q6: agree, no boundary violation; it does not cancel a previously armed reveal.
- Q7: optional minor standards cleanup, not a correctness finding.
- Q8: split the finding: stale PR description needs correction before merge; historical commits do not inherently require rewriting.
- No code changes, runtime tests, or new decisions; no progress entry is needed.

## Q1 — agree: false positive

The precondition is explicit in `paneTerminalPlacement.ts:3–5` and satisfied by `OpenTabFeature.ts:41–44`: n requests and n groups. On this path, the filled-source check at manager `:125–138` covers successful loop completion; the catch covers failure after the placeholder has been acquired. The cycle argument is sound under the supported no-concurrent-input scenario.

Judge the resource invariant rather than requiring the literal `finally` syntax. Acquisition before the variable is assigned is a separate question (Q2), so do not claim this proves every possible acquisition failure is covered.

## Q2 — amend: unproven risk, minor / nonblocking

There is a conditional gap: the tab is only tracked after the bounded lookup succeeds (`PaneTerminalSurfaceManager.ts:102–115`), and the error handler cannot close an unassigned placeholder (`:149–157`). The code alone does not establish that a shown placeholder's tab can remain unavailable for five seconds in the supported scenario; nor does it establish that this is impossible.

Do **not** classify it as a confirmed leak or require URI-based fallback ownership solely from this hypothetical timeout. Record the limitation if useful; ask for an actual host event/error trace before adding recovery state. The earlier cleanup requirement does not authorize closing arbitrary matching editors. If a supported acquisition failure is reproduced after the editor becomes visible, it becomes an actionable cleanup defect at the manager, not a reason to weaken cleanup.

## Q3 — agree on disposition, amend the justification

**False positive as a demand to replace the catch or let cleanup mask the primary error.** Preserving that error is expressly required. The catch may suppress a secondary cleanup rejection without rollback or retry.

Do not state that close rejects *only* when the tab has already disappeared: that was not established. The API also returns a boolean, which this code ignores. For the owned empty, non-dirty placeholder with concurrent user editing excluded, no evidence supplied here establishes a reachable refused close leaving it visible. Therefore no new guard/retry is required. This is bounded cleanup, not proof that cleanup can never fail.

## Q4 — agree: investigate only, minor

The pending-callback path is real: creation arms `revealOnOpen`; placement waits for a tab, not pty open; `open()` later invokes plain `terminal.show()` (`PaneTerminalSurface.ts:145–150,175–179`). But two causal steps remain unproven: that this callback occurs after final focus, and that it activates a different group in the relevant host state. Prior research distinguished terminal reveal from group activation, particularly in an unfocused window.

A focused fresh-window first-Tab check is reasonable follow-up evidence. It should observe final active group/tab and, if investigating keyboard focus, distinguish that from group activation and document OS-window conditions. Do not add a defensive cancellation flag, delay or extra focus loop now. This recommendation is not an automatic expansion of the approved durable test slice.

## Q5 — agree: optional clarity improvement, minor

The default argument and mixed existing/create path do not establish a behavioral defect (`PaneTerminalSurfaceManager.ts:48–70,80–84`). Restoring the comment's reason is the smallest useful improvement. Extracting only creation is also defensible if it genuinely simplifies ownership, but is not a gate or grounds for another abstraction.

## Q6 — agree: false positive on encapsulation

The surface deliberately exposes its terminal, so manager-owned placement may call `terminal.show(true)` for the preserve-focus final pass. The design permitted a surface helper change; it did not require one. A parameterized helper is not intrinsically wrong either—judge whether it clarifies an actual responsibility rather than treating every mode parameter as prohibited.

**Important qualification:** this call avoids arming a new deferred focus-taking reveal, but does not clear the flag previously armed during creation. It does not resolve Q4 by itself. No amendment is warranted without evidence that the pending callback violates final focus.

## Q7 — agree on low priority; distinguish standards from correctness

The dense `misplaced` array and nonempty loop make its missing-first-element branch unreachable on the intended path (`:96–101`). Group columns used by the in-repo caller also satisfy the focus-command precondition. These are not runtime correctness defects.

The owner's no-impossible-guards preference gives a legitimate **minor standards** reason to express those invariants directly where the repository's TypeScript/lint rules permit it. Prefer a readable narrowing over a contorted `for` initializer merely to avoid a throw. Do not create validation machinery for arbitrary invalid callers of a helper whose supported caller already provides a valid column. No architectural amendment or important finding is justified.

## Q8 — amend: separate current PR metadata from history

**Stale PR title/body: agree, important handoff/documentation correction before merge**, on the quoted evidence. They must describe whole-grid positional reuse, surplus merge, sizes, identity and the accepted restart limitation, and name the current seam/ADR. Otherwise reviewers approve the wrong behavior. This is not a production-code defect.

**Historical commits: disagree with mandatory rewriting.** A commit message accurately describing its own then-current diff is not a surviving implementation of that policy. An unmerged branch may evolve from an additive implementation to its replacement. The final tree, current ADR, PR description and review evidence must agree; the record does not require erasing every historical superseded decision.

The coordinator may clean up history if appropriate and authorized, but that is optional hygiene, not an intent finding or a prerequisite for approval. Distinguish locally reshaping commits from the required GitHub **rebase-only merge**; do not recommend squash-merging the PR or authorize a history rewrite/force push through this review. Rebase onto current main and the required passing CI check remain separate merge gates.

## Evidence limits

A read-only `gpt-6-luna` delegate checked the relevant source/ADR and local API types. It ran no tests or external source research. I have not independently fetched the current PR metadata; Q8's metadata verdict is based on the request's quoted evidence. Conditional timing/host-failure concerns above remain conditional, not reproduced bugs.

<!-- end of reply -->
