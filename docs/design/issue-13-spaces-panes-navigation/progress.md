# Issue #13 progress

## Grounding

- Issue #13, parent #9, and completed blocker #12 were read on 2026-09-20.
- Canonical architecture, domain vocabulary, issue-tracker guidance, current manifest, Session projection, snapshot contracts, existing Sessions View, and relevant protocol subscriptions were inspected.
- Initial worktree was clean: `main...origin/main`, with no staged, unstaged, or untracked files before this task directory was created.
- A bounded read-only repository inspection was delegated to `openai-codex/gpt-5.6-luna` at `medium` thinking and completed with file/line evidence.
- A pinned Herdr v0.9.0 source audit was delegated to `openai-codex/gpt-5.6-luna` at `xhigh` thinking. Its evidence is recorded in [`herdr-v0.9.0-navigation-audit.md`](herdr-v0.9.0-navigation-audit.md).

## Current phase

Collaborative product decisions and architecture discussion are complete. The corrected architecture was explicitly approved on 2026-09-21. Implementation and the separately authorized critical tests are complete; the user authorized committing the reviewed work. Push and issue closure remain separate.

## Corrected architectural assumption

- An initial unpresented draft incorrectly placed selected-Space state and the new Views in `SessionsModel`/`SessionsFeature`.
- This contradicted the canonical architecture and its accepted future boundary: issue #13 is a separate top-level Navigation feature that consumes the Session projection.
- The draft was corrected before approval or implementation. `NavigationContextModel` is now the proposed selected-Space owner; Sessions remains the connection/projection owner; `HerdrExtension` composes them through a narrow capability.
- The user agreed that Spaces and Panes are child features composed by Navigation, receive parent-owned capabilities, and do not invoke each other.
- The user agreed that `SpacesModel` and `PanesModel` independently derive their own semantic state from the same immutable snapshot reference plus selected Space supplied by `NavigationContextSource`; they do not copy or patch the Session projection.
- The proposed `navigationViewModels` layer was removed as unnecessary.
- The narrow Sessions-to-Navigation capability was initially named `NavigationSessionState` / `NavigationSessionSource`. During implementation review, the user identified that this made Sessions appear to know its Navigation consumer. It is now provider-neutrally named `ActiveSessionProjectionState` / `ActiveSessionProjectionSource`.
- The user accepted its minimal `unavailable | connected | stale` state contract with Session identity, readable snapshot, and stale reason only; Navigation does not receive catalog, configuration, endpoint, metadata, retries, or detailed unavailable reasons.
- The user accepted the discriminated `NavigationContextState` that atomically combines freshness, Session identity, immutable snapshot reference, and valid `selectedSpaceId`, plus synchronous local `SpaceSelectionOperations`.
- The user accepted separate `SpacesModel` and `PanesModel` derived-state contracts. Both independently compute from the shared context, retain original readonly domain records, and add only child-feature semantics rather than copying the Session projection.
- The user approved a canonical lifecycle amendment: constructors remain lightweight and synchronous, internal listeners are non-throwing, duplicate host registration fails activation loudly, and local rollback/recovery scaffolding is added only for a concrete realistic failure path. `docs/architecture/code-architecture.md` was updated accordingly.
- The verification boundary was narrowed to observable contracts and realistic lifecycle transitions. Issue #13 will not add per-subscriber exception isolation or tests for hypothetical listener/registration failures; feature-internal callbacks are non-throwing contracts and programming defects fail loudly.
- The server-focused → first server Space → none rule is recorded as selection resolution, not runtime recovery. It is used only when entering another Session or when the current selected Space no longer exists, preserving the invariant that readable navigation never references an absent Space.

## Confirmed scope

- Add native Spaces and Panes navigation for the active Session.
- Keep Space identity exactly aligned with server-owned Herdr Workspaces.
- Keep Space selection local to the VS Code client.
- Derive all displayed hierarchy and status from the Sessions-owned projection.
- Preserve readable stale context without allowing unsafe stale actions.
- Do not add terminal surfaces or Pane lifecycle commands in this ticket.

## Agreed decisions

- The extension does not persist Space selection; this explicitly amends parent issue #9.
- Entering a Session resolves selection as server-focused Space, then first server Space, then no selection.
- If a locally selected Space disappears, rerun the same deterministic selection resolution so navigation never references an absent Space.
- During issue #13, subsequent selection remains local and does not follow or mutate Herdr focus. A future feature may intentionally make Space switching server-global.
- Herdr's global focused Workspace is server App state exposed by `session.snapshot.focused_workspace_id`. It survives client disconnect in process memory and a graceful persisted restart when Session persistence is enabled; crash and persistence-disabled durability are not guaranteed.

## Agreed Panes hierarchy

- Multi-Pane Herdr Tabs render as expanded groups named with the server label and Pane count.
- Single-Pane Herdr Tabs are visually flattened so their Pane appears directly at the View root.
- A singleton row uses the Pane name as its primary label and the server Herdr Tab label as less-prominent same-line description and in the tooltip. A custom two-line Webview row is out of scope.
- The singleton row's context menu combines applicable Tab-level and Pane-level actions while each command still targets its real server identity; #13 does not implement later lifecycle/layout actions merely to populate that future command surface.
- Pane rows keep visible text compact: Pane name, plus Tab name only for flattened singletons. Raw IDs and diagnostics stay in tooltips.
- Pane rows intentionally omit Agent and terminal/exited status, including from tooltips. Space rows retain aggregate Agent status. Exited or closed Panes disappear with the authoritative snapshot; the navigation feature owns no tombstone.
- This intentionally amends issue #4's always-group rule and issue #13's blanket grouping wording.
- Group headings do not expose the Herdr Tab term or invent another persistent grouping model.
- Manual collapse state is preserved after a group has initially appeared expanded.

## Agreed Pane naming

- A manual Pane label is a custom server-owned Herdr name, never an extension-local alias.
- Pane names follow the Herdr aggregate navigator: custom Pane label, Agent name, Agent display name, Agent title, then a generated Pane/server-identity fallback.
- The View does not inspect foreground processes or introduce terminal-title naming drift.

## Agreed stale behavior

- Retained stale Spaces/Panes remain visible with one View-level last-known-state message rather than per-row decoration.
- Local Space selection remains available while stale.
- Server mutation/control remains connected-only.
- Fresh projection retains a still-valid local selection and otherwise runs the server-focused/first/none selection resolution.

## Open decisions

- None for the approved issue #13 design.

## Tracker follow-up

- Published the Space-selection architecture amendment on [issue #9](https://github.com/St0necrusher/vscode-herdr-extension/issues/9#issuecomment-5752342778).
- Published the scoped Space-selection clarification on [issue #13](https://github.com/St0necrusher/vscode-herdr-extension/issues/13#issuecomment-5752342883).
- Published the singleton hierarchy amendment on [issue #4](https://github.com/St0necrusher/vscode-herdr-extension/issues/4#issuecomment-5752479205) and its ticket clarification on [issue #13](https://github.com/St0necrusher/vscode-herdr-extension/issues/13#issuecomment-5752479299).
- Published the singleton combined context-menu addendum on [issue #4](https://github.com/St0necrusher/vscode-herdr-extension/issues/4#issuecomment-5752497342) and compact row-text clarification on [issue #13](https://github.com/St0necrusher/vscode-herdr-extension/issues/13#issuecomment-5752497440).
- Published the Pane-status scope amendment on [issue #13](https://github.com/St0necrusher/vscode-herdr-extension/issues/13#issuecomment-5752519551): Pane rows omit Agent and terminal/exited state; Space aggregate Agent state remains.
- Published the server-owned Pane naming clarification on [issue #13](https://github.com/St0necrusher/vscode-herdr-extension/issues/13#issuecomment-5752537681).
- Published the final design-approval boundary on [issue #13](https://github.com/St0necrusher/vscode-herdr-extension/issues/13#issuecomment-5765494226), explicitly noting that implementation was not authorized at that time.
- Published the later implementation authorization on [issue #13](https://github.com/St0necrusher/vscode-herdr-extension/issues/13#issuecomment-5766547876), while keeping tests, staging, commits, pushes, and closure separate.
- Published the final Pane-tooltip clarification and implementation handoff on [issue #13](https://github.com/St0necrusher/vscode-herdr-extension/issues/13#issuecomment-5767144237).
- Preserved issue history through comments rather than silently rewriting the original specification body.

## Design self-review

- Removed the incorrect Sessions ownership of selected Space and aligned the design with the canonical top-level Navigation boundary.
- Removed the unnecessary `navigationViewModels` layer.
- Kept one mutable navigation authority (`NavigationContextModel`) and made Spaces/Panes states derived from the same immutable context snapshot.
- Kept cross-feature and parent-child capabilities at their nearest common owners.
- Removed hypothetical per-subscriber recovery, duplicate-registration rollback tests, structural-cache tests, and unrelated transport duplication.
- Reframed server-focused/first/none as deterministic selection resolution required by the selected-Space validity invariant, not a generic fallback/recovery subsystem.
- Confirmed expected source changes do not include Herdr infrastructure, protocol decoding, Session persistence, or terminal surfaces.
- `git diff --check` passes for the current documentation changes.

## Implementation and reconciliation

- One bounded `gpt-5.6-luna`/high worker implemented the connected production seam. The first run lost provider access after creating only `src/capabilities/sessions/navigation.ts`; an explicitly approved same-model retry completed the slice.
- Parent reconciliation corrected server-order loss between grouped and singleton Tabs, synthetic message rows instead of native View messages, mismatched expansion-state keys, speculative constructor rollback, excess child exports, and unnamed state variants.
- Production behavior now follows the approved ownership and data flow.
- Human implementation review removed Navigation-specific projection methods from `SessionsModel`. `SessionsFeature` now directly implements the narrow provider-neutral `ActiveSessionProjectionSource` over its private model; `HerdrExtension` passes the feature under that interface without publishing a wrapper-object property. `NavigationContextModel` retains ownership of selected-Space policy and reconciliation.

## Critical behavior tests

- After human review, the user separately approved the critical test set from the architecture's verification design.
- `NavigationContextModel.test.ts` covers deterministic initial/replacement selection, local choice, same-Session retention, Session replacement, stale/fresh reconciliation, empty Spaces, and invalid local selection.
- `SpacesModel.test.ts` covers server order, selected identity, original server labels/counts/aggregate status, and connected/stale/unavailable derivation.
- `PanesModel.test.ts` covers selected-Space filtering, interleaved singleton/group server order, Pane order, singleton identities, naming precedence, and connected/stale/no-space/unavailable derivation.
- The existing Extension Host activation test now covers runtime registration of `herdr.selectSpace`. An initial assertion that merely repeated the manifest's View IDs and ordering was removed after user review as low-value configuration mirroring; actual View contribution remains covered by manual review rather than a brittle config-copy test.
- Parent reconciliation removed a contract-breaking invalid selected-Space fixture, corrected Tab counts, and removed an assertion on incidental publication sequencing.
- Optional exact presentation-copy, manual collapse-event, and exhaustive disposal tests remain deliberately deferred.

## Server-focus follow-up research

- Herdr already persists/exposes its currently focused Workspace as server App state; issue #13 reads it for initial selection but intentionally keeps later VS Code selection local.
- A read-only search across open and closed issues found no scheduled ticket for sending Space selection back to Herdr or adding a Follow Herdr/synchronization mode.
- Issues #4, #9, and #13 record this only as replaceable policy or future intent. Related #15, #16, #17, and #21 do not commit to server-global Space switching.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run format:check`: passed.
- `npm test`: passed — 7 files, 53 tests.
- `npm run build`: passed.
- `npm run test:extension`: passed — 6 tests.
- `git diff --check`: passed.

## Final advisory review

- Standards review (`gpt-5.6-luna`/xhigh): no implementation findings; its deferred-test note was resolved by the separately authorized critical test phase.
- Spec review (`gpt-5.6-luna`/max): one P2 questioned missing Session/Space identity in Pane tooltips.
- The user confirmed that Pane tooltips should not duplicate the active Session and selected Space already visible in their owning Views. The finding was classified as a false positive caused by ambiguous design wording; the architecture was clarified without changing implementation behavior.
- No confirmed implementation defects remain. The separately authorized critical behavioral tests were added; optional scenarios remain deferred.

## Approval state

- Product scope and amendments: agreed with the user and published to the relevant issues.
- Detailed architecture: explicitly approved on 2026-09-21.
- Implementation and approved critical tests: reviewed; commit authorized. Push and issue closure are not authorized.
- Optional test scenarios remain deferred.
