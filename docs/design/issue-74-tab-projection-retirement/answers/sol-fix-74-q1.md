# sol-fix-74-q1 — moved-terminal close lifecycle

## Summary

**Explanation:** the supplied trace refutes membership loss/stale binding in this settled reproduction. The projected editor tab closes, the surface deregisters/disposes, and navigation succeeds; the remaining failure concerns VS Code's terminal registry/event lifecycle.
**Experiment authorized:** a bounded, reversible terminal-first disposal experiment in the already-owned manager/surface files, with tests unchanged and diagnostics removed afterwards.
**Production acceptance is not authorized by this answer.** Terminal-first can change refusal/partial-failure semantics even if `tabGroups.close` is still called afterwards.
**Proposed amendment requiring approval:** replacing the tab-close operation or pre-empting its refusal semantics with irreversible terminal disposal.
If the host still retains the closed Terminal, report the demonstrated host/test-oracle mismatch and C10 precedent; do not spoof events, weaken assertions, or expand into #73 repair.

## 1. Interpretation of the new evidence

Your trace establishes that the bound p6E member is selected for retirement, its current editor tab closes, its Pseudoterminal close callback runs, and its managed surface is removed/disposed. That fulfills the editor-grid retirement portion of D2. The observation that `window.terminals` retains its Terminal and `onDidCloseTerminal` never fires is a separate host-lifecycle fact, not proof that membership survived or retirement skipped it.

This narrows my earlier `luna-tests-74-q1` ruling: the observable test failure required diagnosis, and its terminal-identity oracle was expressly left to be checked. Given this trace and the cited C10 precedent (`test/extension/pane-editors.test.ts:240–263`), it is no longer justified to call this reproduction a confirmed membership/retirement defect. Classify it as an **unresolved host-lifecycle versus test-oracle conflict**, with the intended grid behavior demonstrated by the supplied evidence. I have not independently reproduced or inspected the trace, as this request asks for direct adjudication without research.

Do not yet conclude that retained host registration is harmless: distinguish a stale Terminal listing from a surviving tab, attached client, or usable terminal. The surface's disposal and client cleanup evidence matters more than receipt of a particular host event.

## 2. Bounded experiment

You may temporarily initiate disposal through the already-owned Terminal identity before the tab-close path and run the same isolated cases. Keep the scope manager/surface only; do not alter tests or introduce new public seams.

Record:

- whether the exact current tab disappears, both close callbacks/events occur, and the exact Terminal leaves `window.terminals`;
- whether the manager/surface/client lifecycle completes once and navigation produces the intended grid;
- whether the existing retained-target scenarios remain unchanged;
- what operation now provides the close-completion signal and what happens to the existing refusal/error contract.

Use existing bounded waits/observable lifecycle signals. No arbitrary settling delay, title matching, forced registry mutation, event spoofing, or blanket new disposal/recovery framework. Remove temporary diagnostics. If the experiment fails, restore the experimental change; if it succeeds, report the minimal candidate and its semantic differences before production acceptance.

## 3. Production ordering versus the approved failure contract

**Explanation:** selecting disposal order within the resource owner can be a local implementation correction only if it preserves the accepted externally observable close/failure behavior. Merely using the same Terminal object is not sufficient proof.

`Terminal.dispose()` has no close-refusal result. Calling it *before* `tabGroups.close` may already destroy the terminal, so a later false result cannot preserve the previous “close refused” outcome. Retaining the tab-close call syntactically does not preserve that contract. Similarly, replacing it entirely changes the documented close primitive and refusal handling.

**Proposed amendment:** if the only working candidate makes disposal unconditional or otherwise changes partial-failure semantics, bring that explicit difference to the coordinator/design owner for approval and record it in the architecture before accepting production code. Do not add rollback machinery to fake the old outcome. Conversely, if evidence demonstrates a lifecycle ordering adjustment that really preserves the existing contract, submit it as an explanation/local correction for normal review; this answer does not pre-accept an unobserved candidate.

## 4. If terminal-first does not fix the host observation

Escalate to the coordinator with the exact command, host version, trace, and existing C10 precedent. Separate these observations in the report:

1. required Pane Editor/grid retirement and subsequent navigation;
2. surface/client resource release;
3. missing host close event and stale Terminal enumeration.

Ask for a test-oracle review against those observations. D2 requires retirement of the Pane Editor, not independently a guarantee that VS Code emits `onDidCloseTerminal`. Nevertheless, tests remain read-only in this worker slice: any change to the oracle needs explicit authorization and must still prove the intended closure/resource behavior rather than simply dropping the failing check.

If the host retains a functional resource rather than only stale enumeration, report that separately as an actual unresolved lifecycle defect. Neither outcome authorizes #73 identity repair, title-based workarounds, or silent expected-failure classification. Preserve the evidence and leave the validation result accurately reported until the coordinator resolves it.

No new domain term or ADR decision is made here. Record the experiment result and any proposed behavior amendment through the coordinator.

<!-- end of reply -->
