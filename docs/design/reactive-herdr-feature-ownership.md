# Accepted direction: reactive Herdr state and feature-owned VS Code presentation

Status: **architecture direction accepted by the owner; implementation pending [#23](https://github.com/St0necrusher/vscode-herdr-extension/issues/23)**.

This decision tunes implementation structure without reopening product decisions in #1–#9. Canonical architecture documents have been updated to this target; source and ESLint migration remain assigned to #23. This document records rationale and scope, not permission to skip that migration or expand #11.

## 1. Accepted direction

Keep explicit ownership, manual dependency injection, readonly state, and resource lifecycle from #22. Change two structural defaults:

1. Treat the active Herdr Session service as the observable owner of its local server-state projection, rather than adding another store around it.
2. Allow concrete VS Code presentation and command binding to live inside the feature they implement. Do not require a controller, host-neutral view model, view interface, and infrastructure adapter for every presentation.

Recommend a bounded, behavior-preserving refactor of the existing baseline **before #11**. Introduce new state owners only with the behavior that needs them in #11 and later tickets.

## 2. Product contract is unchanged

The accepted MVP remains the authority: [#9](https://github.com/St0necrusher/vscode-herdr-extension/issues/9) and its [consolidated specification](https://gist.github.com/St0necrusher/6be5bf5d1d7fca75583167491d1918f7). Earlier intermediate proposals do not override their final resolutions.

- Herdr owns Sessions, Spaces, Herdr Tabs, Panes, processes, and Agents.
- One Session is active in navigation Views. Selection is local to this VS Code workspace/window.
- Switching navigation Session does not close existing terminal editors or server resources.
- Server focus changes update observed data; they do not automatically move local navigation or editor focus.
- Opening a Herdr Tab explicitly projects its current layout into editors, additively and best-effort. Live changes do not continuously rearrange editors.
- Terminal surfaces begin as observers. Qualifying local focus transitions acquire control; blur releases it according to the accepted handoff policy.
- Closing an editor detaches the local surface. Closing a Pane is a distinct server operation.
- Recovery, notification policy, mutation gating, and non-destructive behavior remain as accepted. This proposal neither accelerates later tickets nor introduces additional UI.
- A possible future tmux integration is not current scope and does not justify a generic backend contract.

Decision sources: [navigation #4](https://github.com/St0necrusher/vscode-herdr-extension/issues/4), [handoff #3](https://github.com/St0necrusher/vscode-herdr-extension/issues/3), [layout #5](https://github.com/St0necrusher/vscode-herdr-extension/issues/5), [mutations #6](https://github.com/St0necrusher/vscode-herdr-extension/issues/6), and [failure UX #7](https://github.com/St0necrusher/vscode-herdr-extension/issues/7), including their final comments and linked specifications.

## 3. State and resource ownership

| Owner | Owns | Does not own |
| --- | --- | --- |
| Session catalog | Discovery, known Sessions, executable and availability state | Socket authority or Pane data |
| Active Session | Current navigation connection, generation, bootstrap, one observable projection and its freshness | Every open terminal surface |
| Local navigation | Selected Session/Space and local reveal intent | Server focus or a second copy of Pane records |
| Terminal surfaces | Per-surface bridge process, observation/control mode, focus policy, local screen lifecycle and disposal | Herdr process lifetime or navigation connection lifetime |

This is a responsibility map, not a requirement for four new classes or top-level modules. Selected Session can remain owned by the active-session service; split local navigation only when its behavior warrants it.

Open terminal surfaces retain enough Session and terminal identity to survive navigation switching. Future cross-feature communication uses narrow state/operation capabilities, not imports of sibling implementations. The nearest common composition owner wires those capabilities. Do not implement terminal ownership during the pre-#11 refactor.

## 4. Observable projection contract

```text
Herdr snapshot / ordered events
  → normalized data
  → active-session state update
  → readonly state publication
  → feature subscribers

User intent
  → explicit operation
  → Herdr API request
  → authoritative event / fresh snapshot
  → state publication
```

- There is one writer for the active Session projection. Views do not independently replay protocol events or maintain domain replicas.
- Provide current-state reading and typed disposable subscriptions. Subscribers can initialize from current state without replaying history.
- Apply a complete state transition before notifying subscribers. Do not expose a partially installed bootstrap as authoritative.
- External I/O is asynchronous; an additional asynchronous internal event bus is not required. Keep ordering and reentrancy explicit. Isolate observer failures from protocol/state processing; asynchronous effects handle their own failures and stale completion.
- Request completion and projection observation are distinct. Do not promise that a resolved command means every subscriber has observed its result unless that operation explicitly provides such a guarantee.
- Derive view data where practical. Store pending/error state only where required by an actual operation or presentation.
- Rendering state and producing one-time effects are different responsibilities. Snapshot installation must not accidentally replay historical notifications or focus actions.
- No MobX/Redux dependency is proposed. Introduce a library only for demonstrated complexity, not to establish this dataflow.

## 5. Accepted changes to architecture rules

These replacements are now reflected in the canonical documents. The old source layout remains a tracked migration exception until #23 completes.

| Previous rule | Accepted rule |
| --- | --- |
| All concrete VS Code presentation belongs to `infrastructure/vscode` | Feature-specific presentation and command binding belong to that feature's explicitly named `vscode/` child. Cross-feature host facilities may remain in infrastructure. |
| Features are entirely host-neutral | State owners, synchronization, and independently meaningful policy remain host-neutral. The feature's host child may use VS Code directly. |
| Every view follows capability data → feature view model → infrastructure view | Presentation reads a narrow state source and invokes narrow operations. Add a model/controller/interface only for a current policy, transformation, substitution, or testing need. |
| Feature composition cannot construct its concrete VS Code presentation | A feature-owned host composition entry constructs its host children; the extension root wires top-level dependencies and owns top-level lifecycle. |

Retain capability independence, public entry points, sibling isolation, package-import aliases, class/lifecycle rules, and feature-to-infrastructure implementation isolation. Allowing `vscode` imports is **not** permission to import concrete Herdr infrastructure from a feature.

Enforce host placement generically: `vscode` imports are allowed in feature `vscode/` children, existing host infrastructure, and extension composition. They remain forbidden in capability modules and host-neutral state/policy modules. Do not replace the current guardrails with an unrestricted feature-wide exception.

Pure feature entry points must not transitively load `vscode` merely because host code is colocated. Expose a deliberate host composition entry separately from the host-neutral public surface, with matching Node package imports where needed. Ordinary Vitest tests must be able to load the latter without mocking the entire VS Code module.

Shared logging/configuration facilities need not move simply to make the directory tree symmetrical. Ownership and actual consumers decide placement. Move single-feature contracts out of top-level capabilities only after their remaining consumers have been checked.

Canonical amendments recorded now; their enforcement ships with #23:

- `docs/architecture/code-architecture.md`: feature host children, presentation, composition, and public entry rules.
- `docs/architecture/object-design.md`: optional presentation intermediates; retain lifecycle and real-boundary DI.
- `docs/architecture/sessions.md`: observable active state and feature-owned host composition.
- `docs/architecture/verification.md`: host-neutral importability and updated allowed/forbidden import examples; remove obsolete Dependency Cruiser transition wording.
- `eslint.config.mjs` and `package.json`: enforce the accepted boundaries and entry points in the same migration.

## 6. Refactor before #11: existing behavior only

Use the existing discovery/status/commands slice to establish the boundary before adding sockets.

### Intended scope

- Move `VsCodeHerdrStatusView` from `src/infrastructure/vscode/presentation/` into the Sessions feature's host child.
- Move Session-specific VS Code command registration from `src/infrastructure/vscode/commands/` into the same feature owner.
- Add an explicit Sessions host composition entry; update `HerdrExtension` to use it and transfer resource ownership without double disposal.
- Keep the catalog and substantive status/action policy independently importable and testable without VS Code.
- Preserve the existing controller/view seam where it still carries real behavior or a useful controlled test boundary. Do not merge it solely to reduce class count. New Views are not required to copy it.
- Update exports, aliases, canonical rules, and architecture lint together. Remove only files/contracts made obsolete by these moves.

### Explicit exclusions

No socket client, projection reducer, persistence, Session selection, new Views, terminal feature, reconnect, new dependency, generic backend, or speculative directory scaffolding.

Preserve current visible status semantics during this refactor, including the baseline's CLI-derived `connected` state. The deliberate correction to actual socket authority belongs to #11, not a behavior-preserving migration.

### Exit criteria

1. Existing discovery, explicit start, status actions, configuration refresh, command IDs, and disposal behave unchanged.
2. State/policy tests load without VS Code; host code is feature-owned with explicit resource ownership.
3. Generic lint allows the intended host child and rejects VS Code in state/capability code and concrete Herdr infrastructure imports from features.
4. Existing behavioral assertions remain intact. Any changed public test seam is explicitly justified; do not rewrite tests merely to match new private classes.
5. The validation baseline passes or blockers are recorded. No #11 behavior is bundled into this refactor.

The earlier `/impl` rule separates test authoring from production implementation. If execution uses that workflow, test additions/changes and guardrail verification fixtures need an explicitly approved testing phase; they are not silently included in a production-only pass. Existing tests can still run throughout.

Repository commands: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, `npm run test:extension`. This proposal does not claim these checks have run for a refactor that has not started.

## 7. Work that belongs inside #11

`docs/design/issue-11-connect-bootstrap-session.md` has been revised to this target now. Confirm actual filenames and composition after #23; the bootstrap evidence gate remains unresolved:

| Sections | Amendment |
| --- | --- |
| §4 baseline | Update to the actual post-#22/post-refactor structure; avoid describing a retired implementation. |
| D1, §§8/11 | Make the active service the observable projection owner; distinguish it from catalog availability and local navigation. No additional wrapper store. |
| D9, §§6/7.6/12–14 | Use a feature-owned Sessions TreeProvider/presenter and explicit host composition. Keep extra controller/model seams only where justified. |
| D3–D5, §10 | Replace the unverified same-socket decision and the claim that idempotence alone makes snapshot overlap safe with a version-checked bootstrap contract. |
| §§16–19 | Update affected files, behavioral seams, integration checks, and implementation sequence to the accepted ownership. |

The current public [Socket API documentation](https://herdr.dev/docs/socket-api/) instructs subscribing on another connection, awaiting acknowledgement, buffering, taking a snapshot, and replaying in order. Verify applicability to the targeted Herdr 0.9.0/protocol 22 before choosing transport topology. A controlled server test proves client behavior, not the real server's ordering guarantee; use version-specific evidence or a bounded real-server probe for that claim. Idempotence remains useful but does not by itself establish snapshot/event reconciliation correctness.

#11 implements only its existing product scope. Reconnect/stale recovery and terminal behavior remain in their assigned later tickets.

## 8. Recommended sequence and approval boundary

1. Architecture direction approved: feature-owned host code and separate host entry points.
2. Implement the bounded #23 migration; canonical rules are updated, while code, aliases, and automated guardrails must change together.
3. Validate the existing baseline without product changes.
4. Confirm the already revised #11 design against the completed refactor and resolve its version-specific bootstrap uncertainty.
5. Implement #11, adding only the state and behavior it requires.

If doing the refactor inside #11 instead, keep it as a distinct first, behavior-preserving slice with the same exit criteria. Do not intertwine file movement, import-policy changes, and new socket state transitions in one unreviewable change.

Documentation update only: canonical architecture and the #11 design now reflect the accepted target. #23 tracks the pending source/guardrail migration and blocks #11. No production/test code, lint configuration, or package mapping has been changed by this documentation update.
