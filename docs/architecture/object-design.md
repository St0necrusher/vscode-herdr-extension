# Object design

Read this reference before defining or changing interfaces, classes, dependency injection, factories, state ownership, runtime composition, initialization, or disposal. The ownership and dependency rules in [`code-architecture.md`](code-architecture.md) remain authoritative.

## Capability interfaces

Create an interface when at least one of these conditions is true:

- a dependency crosses a module boundary;
- a consumer needs a narrower capability than a concrete class exposes;
- production and controlled test implementations must vary;
- multiple current providers implement the same consumer contract;
- a dynamic resource is created through an injected factory;
- an external or nondeterministic mechanism must remain replaceable.

A class used only inside its owning module does not need a matching interface. Do not create `SomethingInterface` for every `Something` class.

Interfaces belong to the nearest owner of the consumer contract. Name an interface after the capability required by the consumer. Name a concrete class after its mechanism when that distinction is useful:

```ts
export interface HerdrSessionConnectionFactory {
  create(session: HerdrSessionDescriptor): HerdrSessionConnection;
}

export class JsonSocketHerdrSessionConnectionFactory
  implements HerdrSessionConnectionFactory {}
```

Use narrow role interfaces when consumers need different parts of one provider. For example, a status controller can receive a state source while a command controller receives operations. One concrete service may implement both interfaces.

Capability types use domain vocabulary and do not expose implementation types. Convert Node errors, VS Code objects, CLI responses, and protocol DTOs before they cross the boundary.

## Dependency injection

Pass external dependencies and long-lived collaborators through constructors. The nearest composition owner selects the concrete implementation.

A long-lived object receives its socket provider, process runner, persistence store, clock, randomness source, logger, views, commands, and sibling capabilities. It does not construct or look them up itself.

Use an injected factory when a service creates dynamic resources such as connections or bridge processes:

```ts
export interface HerdrSessionConnectionFactory {
  create(session: HerdrSessionDescriptor): HerdrSessionConnection;
}
```

A service can create its own local state, value objects, arrays, errors, and short-lived private details. These are not dependencies.

Manual constructor injection is the default. Runtime lookup, decorators, reflection, mutable global registries, and service locators do not define the object graph. Introduce a DI container only through an explicit architecture decision that demonstrates a real scope or graph problem that manual composition cannot express clearly.

## Composition

The nearest owner composes its children:

- `HerdrExtension` composes top-level infrastructure and features;
- a parent feature composes its child services and controllers;
- a parent infrastructure module composes its child mechanisms.

A composition owner may import the concrete classes it owns. It injects capability interfaces between siblings so sibling implementations remain isolated.

Keep each graph explicit in one discoverable composition class. The top-level graph shows top-level owners. A parent graph shows the implementation it owns. Do not flatten every child constructor into `extension/`, and do not hide local composition behind runtime registration.

## Initialization and disposal

The composition owner initializes children in dependency order and disposes them in reverse order. Register ownership before starting asynchronous initialization so partial failure can release every created resource.

Disposal is idempotent. The owner of a socket, child process, timer, subscription, terminal controller, output channel, status item, View, or command registration disposes it or transfers that ownership explicitly to its composition owner.

A long-lived object exposes a clear initialization and disposal contract when construction alone is not sufficient:

```ts
export class ExampleFeature implements Disposable {
  async initialize(): Promise<void> {}
  dispose(): void {}
}
```

Initialization failure leaves no unowned live resource. Disposal cancels timers and subscriptions, closes owned connections, invalidates in-flight work, and prevents late callbacks from publishing new state.

Closing or disposing an extension-owned client resource does not stop server-owned Herdr Sessions, Spaces, Herdr Tabs, Panes, processes, or agents unless an explicit user operation requests that server action.

## Classes, plain data, and rich objects

Prefer classes for objects with identity, mutable state, lifecycle, resource ownership, or several related operations. This normally includes:

- services;
- controllers and handlers;
- live connections;
- protocol clients;
- resource factories;
- infrastructure implementations;
- composition owners.

Represent long-lived mutable behavior with named classes whose state and lifecycle are visible. Factory functions may create plain values or short-lived objects; they do not replace a named class by hiding long-lived mutable state in closures.

Prefer readonly plain objects and discriminated unions for data, snapshots, commands, events, errors, and observable state. Services own state transitions and publish new readonly state rather than exposing mutable objects.

A rich object is appropriate when behavior naturally belongs to the object because it protects invariants, owns meaningful state, or owns lifecycle. A data object does not gain methods merely to forward calls to a service.

For example, a live `HerdrSessionConnection` can be a rich object because it owns a socket and lifecycle. A `Pane` remains plain data when `Pane.close()` would only forward its identifier to another service.

Each mutable state has one owner. Split a service when a distinct state owner, lifecycle, responsibility, or independent consumer appears. File size alone does not create an object or module boundary.

## Functions and transformations

A standalone function is appropriate when the operation is a coherent, stateless concept with a clear owner.

Keep a small transformation private to its owning class or module. Extract a named function or class when the concept becomes independently understandable or reusable.

Place parsing and mapping beside the protocol, feature, or view that owns the transformation. A protocol client converts wire data into capability data; a feature converts capability state into a host-neutral model; a concrete view converts that model into host presentation.

Use semantic names for extracted concepts. Do not create generic `utils`, `helpers`, `common`, `parsers`, or `mappers` dumping grounds.

## Review checklist

For every added or changed object, verify:

- its owner and lifecycle are explicit;
- its constructor dependencies are capabilities or owned collaborators;
- it does not construct an external dependency that should be injected;
- its interface names consumer behavior rather than provider technology;
- implementation types do not cross capability boundaries;
- one object owns each mutable state;
- a class, plain object, rich object, or function was chosen for its responsibility rather than by a universal style rule;
- initialization failure and disposal leave no live owned resource.
