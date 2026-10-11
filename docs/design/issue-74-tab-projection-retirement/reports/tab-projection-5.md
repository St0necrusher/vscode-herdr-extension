# Tab Projection test slice — round 5

- **Status:** added the missing reverse-direction D5 case in `test/extension/tab-layout.test.ts` only.
- The new case projects Tab 12 over Tab 13: four old Pane Editors close before the two-cell Tab 13 layout is applied.
- Expected layout is `{ orientation: 1, groups: ["p6D", "p6E"] }`, groups `[ ["p6D"], ["p6E"] ]`, focused Pane from `tab13.layout.focusedPaneId`.
- The new focused test passed: **1 passing**.
- `npm run typecheck`: passed; `npm run lint`: passed; `npm run format:check`: passed.
- `npm test`: **16 files, 158 tests passed**.
- `npm run test:extension`: **101 extension-host tests passed**; real composition **1 passed**.
- Known baseline exception: fresh-window focus test **0 passed / 1 failed**, `takes keyboard focus from the Panes View` (timeout waiting for keyboard focus).
- The required validation chain exits 1 only for that known baseline exception.
- `git diff --check`: passed.
- No new product domain terms or hard-to-reverse decisions; no CONTEXT or ADR entry proposed.
- No production changes, commits, or pushes.

## D5 coverage restored

The deleted “returns to real Tab 12…” test had an independently valid direction: after projecting the four-member Tab 12, project Tab 13 over it. The new test uses `withLayout(tab12, …, [tab13])`, opens `w3:t4Z`, captures the four Tab 12 Terminals (`p69`, `p6C`, `p6A`, `p6B`), and declares all four with `harness.expectClosed(...)` before opening `w3:t40`.

It asserts the literal editor shape `{ orientation: 1, groups: ["p6D", "p6E"] }`, `groupTabs()` as `[["p6D"], ["p6E"]]`, and the active tab as `tab13.layout.focusedPaneId` (`p6E`). The harness's ordinary close postconditions verify all four Tab 12 Terminals close. This complements the existing D5 test for switching from the two-member Tab 13 projection to the four-member Tab 12 projection; no other assertions or files were changed in this round.

## Shared postcondition active-tab wait (review N3)

The shared postconditions at `test/extension/tab-layout.test.ts:717-722` wait, with bounded `waitForEditorGroups`, until the requested Pane tabs are active before asserting active identity. This preserves the assertion while accounting for asynchronous host state: `navigateToPane` returns after `openPane`/`surface.reveal()`/`terminal.show()`, but does not wait for the extension host's tab model to publish the active-tab update. This is the N3 behavior noted in `reports/review-tab-projection-1.md`; it is a synchronization wait, not a weakened expectation.

## Validation

Focused command:

```sh
npx vscode-test --config .vscode-test.mjs --label extension \
  --run dist/test/extension/tab-layout.test.js \
  --grep 'a Tab navigation click retires a larger Tab Projection before opening Tab 13'
```

Result: **1 passing**.

Required validation command:

```sh
npm run typecheck && npm run lint && npm run format:check && npm test && npm run test:extension
```

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed; all matched files formatted.
- `npm test` — passed: **16/16 test files, 158/158 tests**.
- `npm run test:extension` — extension host **101 passing**; real Herdr extension composition **1 passing**.
- Fresh-window suite — **0 passing / 1 failing**: `The first Pane Editor of a window` → `takes keyboard focus from the Panes View`, timed out waiting for the Pane Editor to report keyboard focus. This is the stated baseline exception and the sole reason the full command exited 1.
- `git diff --check` — passed.

No new product domain term, behavior policy, or hard-to-reverse product decision was introduced. No `CONTEXT.md` or ADR change is proposed. Existing working-tree changes outside this round, including `progress.md` and `agents-navigation.test.ts`, were left untouched.

<!-- end of reply -->
