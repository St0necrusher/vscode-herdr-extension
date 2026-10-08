# Architecture

Status: proposed.

Layered architecture with one-directional dependencies. This document is the source of truth for **where new code goes**.

> How to write code inside a block (state owners, lifecycle, async, tests) → [`IMPLEMENTATION.md`](./IMPLEMENTATION.md).
> Domain terms → [`CONTEXT.md`](../../CONTEXT.md). Why a decision was made → [`docs/adr/`](../adr/).

## 1. Layers

```
extension/   composition: builds everything, wires live sources, owns the lifecycle
    │
views/       what the user sees and clicks in VS Code: sidebar trees, status bar, hovers
    │
features/    a scenario the user starts and finishes
    │
modules/     what exists: application state, rules, and the resources that embody them
    │
api/         Herdr is our backend: commands, protocol, consistency of received data
    │
core/        generic code with no knowledge of Herdr or of this product
```

| Layer | May import from | May NOT import from |
|---|---|---|
| `core/` | packages outside `src/`, other `core/` blocks | every other layer |
| `api/` | `core/`, other `api/` blocks | `modules/`, `features/`, `views/`, `extension/` |
| `modules/` | `core/`, `api/` | **other `modules/`**, `features/`, `views/`, `extension/` |
| `features/` | `core/`, `api/`, `modules/` | **other `features/`**, `views/`, `extension/` |
| `views/` | `core/`, `api/`, `modules/`, `features/` | **other `views/`**, `extension/` |
| `extension/` | every layer | — |

The order is the allowed direction of imports, not a call pipeline: a view may call a module operation directly, with no feature in between.

A block is one folder under a layer: `modules/sessions/`, `features/close/`, `views/sidebar/`. The **peer rule** forbids imports between two blocks of `modules/`, `features/`, or `views/`, also through re-exports. Blocks inside `core/` and `api/` may depend on each other without cycles.

Another block is reached through its `index.ts` and the layer alias (`@core/…`, `@api/…`, `@modules/…`, `@features/…`, `@views/…`). Inside a block, imports are relative.

## 2. Where does new code go? — decision tree

**Describe the thing in one sentence**, then place it:

1. The code sends commands to Herdr, parses its protocol, or keeps the received data consistent → `api/herdr/`.
2. The sentence names a scenario the user starts and finishes (create, rename, close, run, reveal, install…) → `features/<scenario>/`. **Scenario beats surface**: it holds when only one tree starts the scenario today.
3. The sentence has no meaning without its VS Code surface: a tree row, an icon, a tooltip, a hover, expanded state, drag and drop → `views/<surface>/`.
4. The sentence is about the data, its rules, or a resource that embodies it → `modules/<domain>/`.
5. The sentence mentions neither Herdr nor this product → `core/`.

| Thing | One sentence | Layer |
|---|---|---|
| Socket bootstrap, request correlation | how a consistent Herdr snapshot is obtained | api |
| Attach and observe processes | how a Pane's terminal is streamed from Herdr | api |
| Reconnect schedule, keeping a Stale snapshot | whether the window keeps a Session connected and which data stays available | module |
| `worktreeGroup(space, spaces)` | which Spaces form a Worktree Group | module |
| Last-Pane / last-Tab closability | whether a Pane or Tab can be closed | module |
| Observe vs Attach for a Pane Editor | which client a Pane Editor runs | module |
| Selected Space following the Focused Pane Editor | which Space this window browses | module |
| Confirm, close in Herdr, close the Pane Editors | **closes** a Space and its editors | feature |
| Create a Pane, run the script, open its editor | **runs** an npm script | feature |
| Hover link in `package.json` | offers to run the script under the pointer | view |
| Panes tree, Tab drag and drop | shows the Selected Space's Tabs and Panes | view |
| Visible-Pane-Editor row decoration | marks rows whose Pane has a Visible Pane Editor | view |

A fact about the data belongs to a module even when one scenario reads it today. A scenario's answer belongs to the feature even when it is a pure function. A tree is a view, not a scenario.

A rule that Herdr defines (the Worktree Group) is placed by what our code does with it, not by where it came from.

## 3. Block shape

The root of a block shows what the block does. Start with files at the root; give a part its own folder only when it has parts of its own. A part lives with the part that owns it. Code used by several parts lives in `shared/` of their nearest common ancestor.

Imports inside a block go in two directions only:

- **Down**, into your own subtree, through each child part's `index.ts`.
- **Up**, into `shared/` of an ancestor (`../shared`, `../../shared`).

A part imports the files of its own flat sub-parts directly; a part without its own folder needs no `index.ts`. Never sideways into a sibling part: when you need a sibling's code, move it to `shared/` of the nearest common ancestor.

```
<block>/
├── index.ts          the block's public entry: what other blocks need, never something for tests only
├── <leaf-part>.ts    a part with no parts of its own stays a flat file
├── <part>/           a part with parts of its own
│   ├── index.ts
│   ├── <sub-part>/   recursive: the same shape at every depth
│   └── shared/       code used by several parts of this level
└── shared/           code used by parts from different branches
```

## 4. Per-layer rules

### `core/` — generic mechanism

**Litmus:** "Could I copy this into an unrelated project as-is?" → yes.

### `api/<system>/` — the backend

Herdr is our backend. `api/herdr/` owns the state needed to talk to Herdr correctly: subscriptions, pending requests, bootstrap, a consistent snapshot, and the signal that synchronisation is lost; it performs the connection and initial synchronisation on request, and the module decides when to retry.

- Exports normalized readonly data (`HerdrSessionSnapshot`, `HerdrSpace`, `HerdrPane`…). Modules use these types directly; a module adds its own type only when its meaning differs.
- Wire DTOs and decoders stay private.
- Receives settings (the executable path) as parameters.
- Knows nothing of which Session the window shows, when to retry, whether to keep old data, which editor to open, or what to tell the user.

**Litmus:** "Is this code needed to interact correctly with the external system?" → yes.

### `modules/<domain>/` — application state and rules

A module owns domain data, rules, and resources independently of any single scenario. It may hold several state owners when their lifecycles differ (the Session catalog and a live Session connection). Every fact and every live resource has one owner.

A module may own the VS Code resources that embody the domain thing: a Pane Editor is a VS Code terminal tab. Views own how module state is shown and clicked.

**A module that needs another module's live data** receives it through its constructor. The module declares a narrow dependency type next to itself, in its own file when that reads better (`modules/pane-editors/session-source.ts`). The type uses plain readonly data and the public `api/` types it needs. `extension/` passes a suitable provider; the provider never imports the consumer's type. A large contract or calls in both directions call for a review of the module boundaries.

**Litmus:** "Is this domain data, a rule, or a resource, independent of one scenario?" → yes.

### `features/<scenario>/` — use case

A feature owns a scenario end to end: prompts, confirmation, execution through modules, consequences across modules, the result and error messages.

- A feature registers the commands of its scenario. Views create the UI that triggers them, also outside the sidebar (a hover, an editor menu, VS Code's npm view), and pass plain data (`{ paneId }`, `{ spaceId }`); a feature never imports view classes.
- A feature with several entries keeps one file per entry (`closePane.ts`, `closeTab.ts`…). Shared parts appear when behavior actually matches, not as one handler with flags.
- A feature keeps no copy of module state.

**Not every verb is a feature.** A click that calls one module operation (refresh, select, retry, open settings) is wired by its view.

**Code that two features need:** a fact about the data → its module; no domain knowledge → `core/`; the two scenarios are one workflow → merge the features; none of these → each keeps its own copy, on purpose.

### `views/<surface>/` — presentation and input

A view owns its VS Code surface: tree data providers, rows, icons, copy, tooltips, hovers, context keys, expanded state, decorations, drag and drop, and the commands of trivial clicks. It reads module state and calls module operations or feature entries. It keeps view state only (expanded rows, the item under a drag), never a second copy of domain state. A view may register a command adapter that extracts surface data and passes it to a feature.

**Litmus:** "Is this about how something looks or is clicked in one VS Code surface?" → yes.

### `extension/` — composition

`extension/` constructs every block, passes live sources, and owns their lifecycle ([`IMPLEMENTATION.md`](./IMPLEMENTATION.md#lifecycle)). It holds no product policy. `package.json` is the global inventory of commands, views, and menus.

## 5. Anti-patterns

| ❌ | Why it's bad |
|---|---|
| `import … from "@modules/sessions"` inside `modules/pane-editors/` | Peer import. Receive the data through the constructor (§4). |
| `import … from "@features/rename"` inside `features/close/` | Peer import. Apply "Code that two features need" (§4). |
| `import … from "@views/sidebar"` inside `features/…` | A feature reads plain arguments, not view classes. |
| A reconnect schedule or a policy for using Stale data in `api/herdr/` | Application policy in the backend layer. It belongs to `modules/sessions/`; `api/` only detects and reports the loss of synchronisation. |
| Parsing socket messages in `modules/` | Protocol detail outside `api/`. |
| `HerdrPane` copied into an identical `Pane` type | A second type with the same meaning. Use the `api/` type. |
| `promptName()` or `showCloseError()` on a view | Scenario UI on a view. It belongs to the feature. |
| A feature folder around one module call | Not a scenario. Wire it in the view. |
| A shared `contracts/` or `capabilities/` folder | Dependency types live next to their consumer (§4). |
| Selected Space copied into a tree provider | Second owner of a fact. Read `modules/workspace-context/`. |

## 6. Naming

| Layer | Folder | Convention |
|---|---|---|
| core | `core/<mechanism>/` | noun naming the mechanism: `process`, `json-socket` |
| api | `api/<system>/` | the external system: `herdr` |
| modules | `modules/<domain>/` | noun naming the domain: `sessions`, `pane-editors`, `workspace-context` |
| features | `features/<scenario>/` | scenario as a verb: `create-space`, `close`, `run-npm-script`, `reveal-pane` |
| views | `views/<surface>/` | the VS Code surface: `sidebar`, `connection-status` |
| view parts | `<part>/` | what the folder contains: `spaces`, `panes`, `agents` |

**Files:** `PascalCase.ts` for a file whose main export is a class, `camelCase.ts` for functions and types. Tests sit beside their file as `*.test.ts`.

## 7. Guardrails

ESLint (`eslint-plugin-boundaries`, `import-x/no-cycle`) must check the import table, the peer rule, the in-block import directions, public `index.ts` entries, aliases, and the absence of cycles. Its rules name layers, not current blocks. When the rules change, verify them on representative allowed and forbidden imports. Tests may import across blocks deliberately; production code never imports tests.
