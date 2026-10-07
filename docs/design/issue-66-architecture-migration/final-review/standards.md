# Standards review — #66

Advisory review of the fixed snapshot at `87215c2`.
No blocking or important standards findings; one minor public-entry cleanup remains.
`npm run lint`, `npm run typecheck`, and `npm run format:check` passed.
Tests were not run as part of this read-only review.

## Findings

1. **Classification:** confirmed defect. **Severity:** minor.
   **Evidence:** `src/modules/sessions/index.ts:5,27,45` exposes the projection mapper/source and Session event contracts, but production code uses these only through same-block imports in `SessionsModel.ts:2,15`; the `HerdrSessionEventSource` contract is not used there or by another block. The actual consumers own their narrow contracts: `modules/workspace-context/source.ts:24-38` and `modules/pane-editors/session-source.ts:24-30`. Likewise, `src/modules/pane-editors/index.ts:7` re-exports presence types that its manager uses internally (`PaneTerminalSurfaceManager.ts:2,17`), while Workspace Context declares its own consumer-side presence types (`workspace-context/source.ts:29-38`). Composition passes the concrete owners structurally (`extension/HerdrExtension.ts:138-139`); no other production block needs these exported contracts. This leaves stale public APIs contrary to ARCHITECTURE §3's “what other blocks need” entry rule and the consumer-owned dependency rule in §4/D7.
   **Recommended fix:** remove the unused cross-block re-exports from the two public indexes; delete only wholly unused source interfaces/types, retaining internal state/event types still used by their owning modules. Keep public entries limited to symbols current consumers need.
