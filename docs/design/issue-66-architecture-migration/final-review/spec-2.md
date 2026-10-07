# Spec Review — uncovered areas

## Summary
- Reviewed only the areas listed as not covered in `final-review/spec.md`, within the requested scope, against `origin/main...HEAD` at `87215c2` using rename-aware diffs (`-M`).
- Traced `api/herdr/**` connection/protocol, CLI, pane-client and takeover behavior; Pane Editor behavior; `SessionsModel` projection methods; connection-status and Sessions sidebar behavior; and `HerdrExtension` lifecycle ordering.
- No confirmed spec defect found in these uncovered areas.
- The moved implementations were behavior-equivalent in the reviewed paths; executable-path contract changes preserve the existing configuration-read timing at their callers.
- Test-assertion comparison was intentionally skipped as instructed; no tests or runtime checks were run.

## Covered
- Compared the scoped moved API implementations with `origin/main` using rename-aware diffs: connection/protocol, CLI, pane clients, and takeover registration/popup.
- Traced the executable-string API changes through `SessionsModel` and the existing settings source; checked that projection mapping and its subscription retain the prior mapping/publication behavior.
- Compared the moved Sessions sidebar and connection-status view/action paths, including command routing and ownership changes.
- Compared `HerdrExtension` construction, initialization, failure cleanup, and disposal ordering with the baseline composition and the former `SessionsFeature`/`NavigationFeature` owners.

## Not covered
- Test-title/assertion comparison, as explicitly excluded by the coordinator; no tests, typecheck, build, or runtime validation were run.
- Exhaustive runtime exploration of asynchronous races or failure timing beyond the source-traceable lifecycle ordering above.
- Paths outside this requested uncovered scope; see `spec.md` for the previous review's coverage and remaining broader review/CI items.

## Findings
None confirmed.
