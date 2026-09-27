# Issue #26 — implementation orchestration brief

Dispatched 2026-09-27 by Claude session `issue #26 prototype review` (Herdr pane `w3:p19`, design owner). You are `opus-impl26`, the implementation orchestrator. The repository owner (the user) may talk to you directly in your Herdr tab. **Talk to the user in Russian; write code, docs, commits and reports in English.**

## Authority and inputs

- **Approved architecture: [`architecture.md`](architecture.md) as of commit `8b3f498`** on branch `worktree-issue-26-mobile-takeover`. It is the contract. Read it fully, plus [`progress.md`](progress.md) and [`spike-tap-signal.md`](spike-tap-signal.md).
- Requirements: `gh issue view 26`. Repo rules: `AGENTS.md`, `CONTEXT.md`, `docs/architecture/code-architecture.md` (canonical), #16 design `docs/design/issue-16-focus-control-handoff/architecture.md` (Surface/converge/intent model you extend).
- Evidence code (read-only reference, not to copy wholesale): prototype `git show 655c1a9:prototype/direct-attach-handoff/popup-probe.cjs`, `655c1a9:prototype/plugin-yield-popup/`; spike `spike/issue-26-tap-signal` @ `b44966f`, `prototype/issue-26-tap-signal/{mirror.cjs,herdr-rpc.cjs,tap.cjs,herdr-plugin.toml}` (worktree `/private/tmp/vscode-herdr-issue26-spike`).
- Workspace: this worktree, `/Users/kuzmichev/dev/vscode-herdr-extension/.claude/worktrees/issue-26-mobile-takeover`, branch `worktree-issue-26-mobile-takeover`.

## Your job

1. Partition the approved design into slices, run implementation workers, review every diff yourself against `architecture.md`, send concrete rework until it conforms, and commit per accepted slice on this branch. You may push this branch; never push to `main`, never force-push, never merge.
2. Workers: pi `openai-codex/gpt-6-luna` (max thinking) in Herdr tabs via the `multi-agent-delegate` skill; instruct them with the `implement-slice` skill. One worker per slice. Parallel slices get separate git worktrees branched from this branch, and you integrate them here. Keep each worker `ongoing` until its slice is accepted, then close its tab.
3. Suggested slices (adjust if you find a better split, and state why):
   - **S1 `TakeoverPopupHost`** (`src/infrastructure/pane-editors/takeover/`): owner Unix socket (0600, per-user tmpdir, random path), per-offer token, `hello`/`alive`/`retract`/`confirm` protocol, launch via `herdr [--session S] plugin pane open --plugin <id> --entrypoint takeover --env …`, D11 maintain/reopen backoff, dispose. It depends on `isRegistered()` from S4 only through a narrow local interface.
   - **S2 Surface integration** (`PaneTerminalSurface.ts`): D1 sync at the end of `converge()`, the offer bound to the current `AttachedClient`, confirm → revalidate → intent `displaced` → converge, and retract on dispose. Depends on the S1 interface (`TakeoverOffers`/`TakeoverOffer`).
   - **S3 popup plugin** (`herdr-plugin/herdr-plugin.toml`, `herdr-plugin/takeoverPopup.ts`, `esbuild.mjs` bundling to `dist/herdr-plugin/`):
     - the popup connects to the owner socket with `hello <token>`;
     - it exits on `retract`, owner socket close, 3 s without `alive`, or loss of the Herdr socket;
     - the mirror polls `pane.read {pane_id, source:"visible", format:"ansi"}` over `HERDR_SOCKET_PATH` and draws it under the banner "Hold to continue here · VS Code has this Pane";
     - it enables SGR mouse (1000/1006), not focus reporting;
     - any key, mouse press or wheel sends `confirm` and exits immediately;
     - it restores terminal modes on exit.
   - **S4 registration + composition**:
     - `TakeoverPluginRegistration` in `pane-editors/takeover/` owns the registration state and registers the two commands itself (D12): `Herdr: Install Mobile Takeover Plugin`, `Herdr: Remove Mobile Takeover Plugin` in `package.json`.
     - Install: copy `dist/herdr-plugin` → `globalStorageUri/herdr-plugin`, then `herdr plugin link`.
     - Remove: unlink, then delete the copy.
     - `plugin list --json` at activation; refresh the copy on version change.
     - `HerdrExtension` composition.
     - The responsibility-map line in `code-architecture.md`, including the D12 command exception.
     - A README note: run Remove before uninstalling the extension.
   - Serialize S2 after S1's interface is fixed. S1, S3 and S4 can start in parallel against the protocol and interfaces in `architecture.md`.
4. Open questions Q1–Q3 in `architecture.md` are for the implementers to verify live or with the CLI; record the answers in the reports.

## Rules (owner's standing preferences)

- The owner has said the documented project architecture is not sacred: where a different structure is clearly simpler or better, it may be changed (see D12 for an example). Do not change a boundary silently. Propose it to the design owner with the reason and wait for the answer, as with any amendment.

- **No defensive over-engineering:**
  - no flag soup and no guards for impossible states;
  - no rollback scaffolding and no speculative abstractions;
  - named discriminated-union states and small pure decision functions;
  - one owner per fact.
  Reject worker code that adds requirements. The #16 simplification audit (`docs/design/issue-16-focus-control-handoff/simplification-audit.md`) shows what the owner rejects.
- Per slice run only `npm run typecheck`. Run `npm run lint`, `npm run format:check`, `npm run build` and `npm test` once at the end.
- **No new tests yet.** Test authoring needs the owner's separate approval of a scenario list (preliminary plan in `architecture.md`). Existing tests must keep passing. If the Surface change breaks `PaneTerminalSurface.test.ts` construction, a minimal fake `TakeoverOffers` injection there is allowed, and nothing more. Never add production exports, hooks or flags for tests.
- Workers must not commit; you commit. Workers and you must not touch files outside the slice scope.
- **Architecture documents are parent-owned.** Do not edit `architecture.md` or `progress.md`. If implementation contradicts the design (behavior, public contract, module boundary), stop the affected slice and send the design owner (`issue #26 prototype review`) a SendMessage with the evidence and a proposed amendment; wait for the answer. Minor local deviations that change none of these: note them in the report.
- Global Herdr plugin registry: do not `plugin link` anything yourself. Live E2E uses the extension's Install command, run by the owner. Afterwards, ask the owner whether to Remove.
- Use disposable Panes only for live checks; never call `popup.close`.

## Durable records (you own these files)

- `docs/design/issue-26-mobile-takeover-popup/implementation-<slice>-report.md` for each slice. Include:
  - the assignment;
  - the worker name and model;
  - the files changed;
  - review rounds and rework requested;
  - deviations;
  - Q answers;
  - commit hash.
- `docs/design/issue-26-mobile-takeover-popup/implementation-status.md`: slice table, current state, and continuation handles (worker names, tabs, worktrees), so that work can resume without a live session.

## Done criterion and reporting

- All slices committed on this branch.
- Final `npm run typecheck && npm run lint && npm run format:check && npm run build && npm test` results recorded.
- A walkthrough of the manual E2E checklist from `architecture.md` offered to the owner (fix bugs found with the owner through workers, same review loop).

Then SendMessage to `issue #26 prototype review`:
- commits;
- check results;
- deviations and amendment proposals;
- E2E findings;
- what is still open.

Keep your tab open afterwards.
