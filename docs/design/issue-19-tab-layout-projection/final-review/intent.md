# Final review, Intent pass — issue #19 (a Herdr Tab opens as the whole editor grid)

## Summary

- **Verdict: no blocking finding, and no defect in the production code.** One important finding is not about code: the PR #72 title and body still describe the superseded additive policy and must be rewritten before merge.
- The design was recorded (`architecture.md`, `progress.md` decisions 1-28, ADR 0017). The architect `astra-arch` was consulted twice: `final-review/answers-1.md` (priorities and risky decisions) and `final-review/answers-2.md` (verdicts on every uncertain finding below).
- Layering and boundaries match the design. `tabLayoutTree` is pure and in `modules/sessions`. The descriptor mapping and the scenario sit in `features/open-tab`. Placement and identity stay in `modules/pane-editors` behind `PaneTerminalPlacement`, which does not import sessions or apply the grid. `focusEditorGroup` and `waitForEditorGroups` are domain-free code in `core/`. Every import goes through the block `index.ts` files. Composition only passes the existing `surfaceManager` to the feature.
- The positional whole-grid contract is implemented as designed:
  - flattening keeps each promoted child's own extent, and the root size is 1;
  - the code creates first, then moves only Panes whose source group keeps another tab ("fill before drain"), and recomputes from live bindings after each step;
  - a move cycle gets one pinned untitled placeholder, and the primary error is preserved;
  - focus goes Eighth plus `k - 8` × Next, then checks the active group and tab;
  - ordinary `openPane` behaviour is unchanged.
- No over-engineering was introduced. There is no planner, store, settings mutation or retry, and the lifetime "guard soup" from round 1 is gone.
- The additive policy left nothing behind in `src/`, `test/`, `docs/adr`, `docs/architecture`, README, CONTEXT or `package.json`. `openPaneInGroup`, `newGroupRight/Below`, the hop projection and the eight-group cap are all absent. The old ADR file name is referenced nowhere.
- Findings:
  - 1 important: stale PR metadata.
  - 3 minor optional improvements or risks: comment and creation path in `openPaneSurface`, narrowing throws, fresh-window late reveal.
  - 1 minor risk: placeholder acquisition.
  - 3 false positives: cleanup outside `finally`, the swallowed cleanup error (the Standards question), and `terminal.show(true)` through the surface.
- Not redone: the Standards report (no findings) and the Spec report (minor: the repeat-click test does not assert focus).

## Findings

### F1. PR #72 title and body describe the superseded additive policy
- **Location:** PR #72, "Open a Herdr Tab's split layout as editor groups". The body says "The layout is built from the active editor group outward. File editors are never closed or moved". It also names `openPaneInGroup`, `newGroupRight/Below` with focus hops, and `docs/adr/0017-herdr-tab-opens-as-an-additive-editor-group-projection.md`, and it lists "split ratios" as not done.
- **Classification:** confirmed leftover (handoff and documentation; not production code). **Severity:** important.
- **Recommended fix:** before merge, rewrite the title and body for the whole-grid policy:
  - positional group reuse and the surplus merge;
  - Herdr extents as weights;
  - identity (same `Terminal`, never duplicated);
  - cycles and the placeholder;
  - beyond-eight focus;
  - the accepted client-restart limitation (#73);
  - the `placePanes`/`focusPane` seam;
  - the renamed ADR `docs/adr/0017-herdr-tab-opens-as-the-whole-editor-grid.md`;
  - the current test list.
- **Architect (answers-2 Q8):** agrees that this is important and should be corrected before merge. It disagrees that the branch commits 52af907 and 4c70c74 must be rewritten. Each describes its own diff at the time, and reshaping them locally is optional hygiene. The PR is not to be squash-merged, the merge stays rebase-only, and this review does not authorize a force push.

### F2. Fresh-window late reveal might take the final focus
- **Location:** `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:63-70` (creation through `openPaneSurface` → `surface.reveal()`), `src/modules/pane-editors/PaneTerminalSurface.ts:145-150,175-179` (`revealOnOpen` is set and later runs `terminal.show()` from `open()`), `src/features/open-tab/OpenTabFeature.ts:44` (final `focusPane`).
- **Classification:** risk. **Severity:** minor.
- **Trace:** this path matters for the window's first terminal (ADR 0013). `placePanes` waits for tabs, not for the pty to open. If `open()` fires after `focusPane`, the plain `show()` could activate the new Pane's cell instead of `layout.focusedPaneId`. The final `terminal.show(true)` pass does not clear a flag that was already set. The issue is not reproduced: no extension test runs in a fresh window.
- **Recommended fix:** investigate only. A focused check in `test/extension-fresh-window` would click a Tab row as the window's first terminal and observe the final active group and tab, separately from keyboard focus and with the OS-window conditions documented. No cancellation flag, delay or extra focus loop now.
- **Architect (answers-2 Q4, Q6):** agrees: low-priority investigation. Two causal steps are unproven: that the callback runs after the final focus, and that it activates a different group in the unfocused-host state. This is not an automatic expansion of the approved test slice.

### F3. `openPaneSurface` mixes the existing and create paths, and the comment lost its reason
- **Location:** `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:44-71`, comment at `:55`.
- **Classification:** optional improvement. **Severity:** minor.
- **Detail:** `placePanes` calls `openPaneSurface` only when no surface exists (`:81-82`), so only `openPane` uses the existing-surface branch. The default `viewColumn` is computed but unused on that branch. The original comment explained why ("A Visible Pane Editor in an inactive group is revealed so that it takes focus"). The new one says only "without changing its group".
- **Recommended fix:** the smallest step is to restore the comment's reason. Optionally, keep `openPane`'s original body and extract only creation (`createSurface(request, viewColumn)`), if that genuinely simplifies the code. The change does not alter behaviour.
- **Architect (answers-2 Q5):** agrees: optional and minor. Restoring the reason is the smallest useful change, and the extraction is defensible but not a gate.

### F4. Narrowing throws for impossible states
- **Location:** `src/core/editor-groups/index.ts:16` ("Missing editor group focus command"; it cannot fire for `viewColumn >= 1`). `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:100-101` ("Missing misplaced Pane Editor", inside `while (misplaced.length > 0)`).
- **Classification:** optional improvement (standards). **Severity:** minor.
- **Recommended fix:** where the TypeScript and lint rules allow, express the invariant directly. For example, take `const [first] = misplaced` as the loop driver instead of a length check followed by a throw. Do not use a contorted `for` initializer, and add no validation for arbitrary callers of `focusEditorGroup`. These are not runtime defects.
- **Architect (answers-2 Q7):** agrees: low priority. The owner's "no guards for impossible states" rule is a legitimate minor standards reason. Readable narrowing is acceptable.

### F5. A placeholder whose tab lookup fails is never cleaned up
- **Location:** `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:102-115` and `:149-157`.
- **Classification:** risk (unproven). **Severity:** minor.
- **Detail:** the placeholder is tracked only after the bounded tab lookup succeeds. If `showTextDocument` resolves but its tab does not appear within 5 s, the catch cannot close the untitled editor. The code shows neither that this is reachable in the supported scenario nor that it is impossible.
- **Recommended fix:** none now. Record the limitation if useful. Add tracking by `openTextDocument` URI only once a real host trace shows the failure, and never close arbitrary matching editors.
- **Architect (answers-2 Q2):** amended my "false positive" to an unproven low-priority risk, not a confirmed leak.

### F6. Placeholder cleanup is not in a `finally` block
- **Location:** `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:125-138,149-157`.
- **Classification:** false positive.
- **Detail:** the success path closes the placeholder in the loop's last iteration. When nothing is misplaced, `sourceIsFilled` is true for `placeholderColumn`, because n requests map onto n groups (`paneTerminalPlacement.ts:3-5`, `OpenTabFeature.ts:41-44`). The failure path closes it in the catch. Under the supported scenario, which excludes concurrent user input, the cycle structure (a permutation of single-Pane groups) means only one placeholder exists at a time, so line 107 never overwrites a live placeholder. Cleanup is equivalent to `finally` on every exit after acquisition. Acquisition itself is F5.
- **Architect (answers-2 Q1):** agrees; judge the resource invariant rather than the syntax.

### F7. Swallowed cleanup error (the question from the Standards report)
- **Location:** `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:151-155`.
- **Classification:** false positive as a demand to change the catch.
- **Detail:** decision 4 requires preserving the primary error, so a secondary cleanup rejection may be suppressed without rollback or retry. No evidence shows a reachable refused close of the owned empty, non-dirty placeholder that leaves it visible. The boolean that `tabGroups.close` returns is ignored. That is acceptable here, but it is not proof that cleanup can never fail.
- **Architect (answers-2 Q3):** agrees on the disposition. It corrected my justification: it is not established that `close` rejects only when the tab is already gone.

### F8. `managed.surface.terminal.show(true)` reaches past the surface's `reveal()`
- **Location:** `src/modules/pane-editors/PaneTerminalSurfaceManager.ts:140-147`.
- **Classification:** false positive (encapsulation).
- **Detail:** the surface exposes `terminal` deliberately. The design allowed a surface helper for the preserve-focus reveal but did not require one. It does not clear an earlier `revealOnOpen` (see F2).
- **Architect (answers-2 Q6):** agrees.

## Checked without finding

- `tabLayoutTree` (`src/modules/sessions/tabLayoutTree.ts`): same-direction flattening inlines the children of the inner split, each keeping its own extent along the surviving axis; the root sentinel is 1. The "Missing layout split" and "Missing layout cut" throws validate external Herdr data, which is a legitimate boundary.
- `OpenTabFeature`:
  - it is a real scenario, not a facade around one module call: tree, descriptor, `setEditorLayout`, group-count wait, `placePanes`, `focusPane`, and the error message;
  - the `typeof tabId === "string"` check and the silent return on `unavailable` follow `RevealPaneFeature`;
  - the local `EditorLayout` types keep the VS Code descriptor in the feature, as designed.
- `PaneTerminalPlacement` is a narrow consumer interface, like the existing `PaneTerminalOpening`/`PaneTerminalClosing`, not a needless type. `focusPane` is reused for "activate the source, reveal, then move", which provides the reveal isolation readiness gate 1 requires.
- Lifetime: no feature `disposed` flag and no `ensureCurrentSession` after every await. If the session is replaced or the extension disposed mid-projection, `requireSurface` or a bounded wait fails and the user sees "Could not open Tab: …". That is acceptable under decisions 7 and 12, and no new cancellation is needed (answers-1, decision table).
- The accepted continuity limitation (#73) is respected. There is no projection-only suppression, and the tests assert identity and the maximum number of live clients, not uninterrupted clients.
- Wording: `package.json` (`herdr.openTab`, "Herdr: Open Tab", hidden from the palette), the tree item command, ADR 0017 (rewritten and renamed) and CONTEXT (unchanged, per decision 14) are consistent with the new behaviour. The suite name "Tab layout projection" uses "projection" in the sense the design still uses ("the full layout is projected"), not the additive policy.

<!-- end of reply -->
