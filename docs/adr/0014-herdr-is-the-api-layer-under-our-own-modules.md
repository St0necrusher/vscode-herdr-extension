# Herdr is the API layer under our own modules

The code is layered `core → api → modules → features → views → extension` ([`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md)). Herdr is treated as our backend: `api/herdr/` owns only what is needed to talk to Herdr correctly (commands, protocol, a consistent snapshot, the signal that synchronisation is lost), while application state and policy (which Session stays connected, the reconnect schedule, keeping Stale data) live in `modules/`. We chose this over putting the Herdr client into `core/` (core would then mean both "generic" and "Herdr") and over keeping one Sessions owner for connection mechanics and product policy, which is what grew `SessionsModel` into one class mixing both.

Modules, features, and views never import a peer block. A module that needs another module's live data receives it through its constructor, typed next to the consumer; there is no shared contracts folder. This replaces the previous `capabilities/` layer, which existed only to let owners talk and turned every cross-owner need into a repository-level contract.

## Considered Options

- **Allow modules to import modules without cycles.** Fewer rules, but nothing stops one module from gradually steering others; rejected while no concrete case needs it.
- **Selected Space owned by the sidebar view.** Rejected because create-pane, create-space, run-npm-script and reveal-pane also read or set it, and some of them start outside the sidebar.
