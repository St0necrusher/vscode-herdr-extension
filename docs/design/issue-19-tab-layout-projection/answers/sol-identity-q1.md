# sol-identity-q1 — closure-induced column shifts

**Explanation: approve the proposed pre-layout closure fixed point.** This makes the latest owner decision executable; it does not restore the superseded move/identity-preservation policy.

“Already in its cell” must mean **after pre-layout closures have settled**, not merely at command entry. Closing a lone misplaced Pane Editor can shift a previously correct requested Pane Editor out of its cell. That newly misplaced editor must also be closed before applying the final layout.

## Sequence and ownership

Within the manager's pre-layout preparation:

1. Read current bindings. Collect managed Pane Editors in surplus columns and requested Pane Editors outside their assigned columns.
2. Close that batch through their exact bound Tabs and await closure, including removal from the managed-surface registry before recreation.
3. Re-read current bindings and repeat until neither condition holds.
4. Only then apply the layout and create missing requested Pane Editors in cell order.

This is finite preparation, not retry/recovery: each nonempty completed batch removes at least one existing managed Pane Editor, and nothing is created during this phase. Do not add sleeps, a retry budget or persistent placement state. A refused or failed closure must fail preparation rather than spin or proceed with an unsafe merge. Keep ordinary bounded host-event waits where already needed.

Evaluate surplus membership against the live columns on each pass; a batch selected before its closures is closed as selected. Other Tabs' Pane Editors not selected by that surplus rule remain untouched, even if their columns shift. Never close file editors to achieve a column assignment.

## The supplied example

For `[B]|[A]|[D]|[C]|[keep.txt,E]`, closing A/B/C/D moves the final group to column 1. E is now misplaced and must also be closed. `keep.txt` remains in column 1. After the nine-cell layout and creation, the intended literal tabs are:

```text
[[keep.txt,A],[B],[C],[D],[E],[F],[G],[H],[I]]
```

The old assertion that E retains its Terminal is superseded: E's identity is not protected merely because it was correctly placed before other closures. A repeat click on this completed projection closes/recreates nothing.

Do not defer E's closure to post-layout placement: it could collapse the grid just constructed. No move, placeholder or post-layout repair loop is authorized.

The coordinator should fold this explanation into the Recreate section and reconcile the obsolete identity assertions in the tests. Older architecture paragraphs promising same-Terminal movement/original positional file preservation are superseded where they conflict with the owner's accepted recreation and column-shift consequences. No source/test changes were made by this answer.

<!-- end of reply -->
