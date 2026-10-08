# Implementation rules

Status: canonical.

How to write code inside a block. Where the code goes is decided by [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## State owners

A state owner (a model or store) is the one authority over a coherent part of mutable state and its transitions. Split an owner only for an independent invariant or lifecycle; a new consumer or file size alone is no reason. Derived state is computed, never copied into another mutable store.

An owner exposes its current readonly state and disposable typed subscriptions. It applies a complete transition before publishing, so every listener reads a consistent set of facts. Public state carries the identity and freshness a consumer needs; a consumer never reconstructs them from the owner's internal phases.

Define each variant of a non-trivial state-machine discriminated union as a named type, and compose the union from those names. Apply this to new and changed code only.

## Objects and dependencies

- Classes for long-lived identity, mutable state, resource ownership, or lifecycle. Readonly objects and discriminated unions for state, snapshots, commands, events, and errors. Standalone functions for stateless transformations.
- Constructor injection, composed by hand. No DI container. An object never looks up its own dependencies.
- An interface exists for a real boundary: a dependency type between blocks (`ARCHITECTURE.md` §4), an external or nondeterministic dependency, a dynamic resource factory, or several current implementations. A class needs no mirror interface for symmetry or tests.
- Pass an existing public object when it already provides the needed data and operations; no explicit `implements` is required. Expose no internal store only to inject it. A separate adapter exists only for a data conversion or another responsibility of its own, never as a facade that republishes another object's methods.
- TypeScript `private`, not `#` fields.

## Lifecycle

- The composer initializes children in dependency order and disposes them in reverse.
- Disposal is idempotent: it cancels owned timers and subscriptions, closes owned clients, and prevents late publication. Disposing an extension-owned client never stops a Herdr-owned resource unless a user operation asks for it.
- Constructors stay light: create owned objects, attach listeners, register synchronous host resources. Use an explicit `initialize()` only for real asynchronous startup.
- Register ownership of a resource before asynchronous initialization, so a failed initialization leaves no acquired resource without an owner.
- Support repeated or concurrent initialization only when a current caller or contract requires it.
- Programming and manifest errors (a duplicate command id) fail activation loudly. Add partial-acquisition cleanup only for a realistic failure path that leaves an externally visible resource behind.
- Subscriber callbacks inside the extension are non-throwing contracts. Isolate callbacks only at a boundary whose contract says delivery continues after a failure.

## Async

`async`/`await` for Promise-returning flow. When an operation can complete after its owner was replaced or disposed, check that it is still current before changing state or causing further effects; choose the check by the operation's lifetime. Keep ordering, cancellation, and cleanup at each asynchronous boundary.

## Tests

- Test observable behavior at the narrowest practical level. Assert on state and effects, not on private fields or wiring.
- Fast tests sit beside their file. Controlled external-boundary tests go under `test/integration/`; a small critical VS Code suite under `test/extension/`.
- Code that needs no VS Code API stays loadable without importing or globally mocking `vscode`.
- Tests never justify a production export, a facade, or an adapter.

Repository scripts in `package.json` are the source of truth for validation commands.
