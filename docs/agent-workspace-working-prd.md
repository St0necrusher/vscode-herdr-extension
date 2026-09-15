# Agent Workspace / Herdr Integration — Working PRD

> **Status:** Draft / grooming document
> **Research snapshot:** 2026-09-15
> **Purpose:** Capture the current product direction and the main ideas discussed so far.
> **Important:** This is **not** a final technical specification. Some items below are hypotheses, preferred directions, or open questions that still need validation.

---

## 1. Context

The goal is to build a comfortable local workflow for working with coding agents across different terminal/front-end environments without tying the agent session to one specific terminal window.

The current exploration started from using tools such as **Herdr** inside VS Code and standalone terminals such as **Ghostty**.

A few problems became apparent:

- running an interactive TUI inside the VS Code integrated terminal can have input/focus/mouse/clipboard quirks;
- sometimes it is desirable to use VS Code as the main workspace, while at other times a real terminal such as Ghostty is more convenient;
- changing the UI should ideally **not require changing or restarting the underlying agent session**;
- Herdr already solves a number of useful problems, so rebuilding its entire interaction model from scratch may be unnecessary.

The project should therefore focus on creating a better **workspace/session integration layer**, while reusing existing agent/Herdr capabilities where practical.

---

## 2. Product Goal

Provide a local developer experience where an agent session is treated as a persistent workspace resource rather than something owned by one terminal process.

A user should be able to:

- start or open an agent session;
- interact with it from VS Code;
- switch to Ghostty or another terminal;
- return to VS Code;
- keep using the **same running session and state** throughout the process.

The experience should feel closer to attaching different clients to one local session than launching independent copies of an agent.

---

## 3. Core Product Principles

### 3.1 Session first, UI second

The session should conceptually exist independently from the frontend currently displaying it.

VS Code, Ghostty, and potentially other clients are views/controllers for the session rather than owners of the session itself.

### 3.2 Reuse before rebuilding

Herdr already contains useful functionality and integrations.

The preferred direction is to investigate how much of Herdr can be reused through its existing backend/API/plugin architecture instead of recreating all terminal-agent behavior from zero.

Reimplement something only when:

- Herdr does not expose the required capability;
- the existing behavior prevents the desired UX;
- or using the existing implementation would create excessive coupling.

### 3.3 Local-first

The primary target is a local developer workflow.

Communication between components should preferably remain local. A local IPC mechanism such as a Unix domain socket is a natural candidate.

The exact protocol and transport are **not yet finalized**.

### 3.4 Native terminal behavior when possible

When a real terminal is used, applications running inside it should behave like normal terminal applications.

The project should avoid creating a custom terminal emulator unless there is a strong reason to do so.

---

## 4. Primary User Experience

### Scenario A — Work inside VS Code

1. Open a project in VS Code.
2. Open the agent/Herdr integration.
3. Attach to or start a session associated with the workspace.
4. Interact with the session without needing to manually manage a separate backend process.

The exact VS Code presentation is still open. It could be:

- an editor tab;
- a terminal-like editor;
- a custom extension view;
- or another lightweight client.

The important requirement is the session model, not the exact UI implementation.

### Scenario B — Switch to Ghostty

While the same session is running:

1. Focus/open Ghostty.
2. Attach to the existing session.
3. Continue interacting with exactly the same session.
4. No explicit migration/export/import should be required.

Switching clients should be cheap enough that it can become part of the normal workflow.

### Scenario C — Return to VS Code

When the user returns to VS Code, the VS Code client should be able to resume control/view of the same session.

The user should not need to restart the agent.

---

## 5. Session Ownership

A useful mental model discussed so far is that the **backend owns the durable session**, while frontends attach and detach.

This avoids treating:

- the VS Code terminal,
- Ghostty,
- or any specific TUI process

as the permanent owner of the conversation/session.

There may still be a concept of an **active interactive client**, but this is separate from ownership of the session itself.

### Desired behavior

- Frontends can disconnect without destroying the session.
- Reconnecting should restore the current state.
- A frontend should be able to determine whether a session already exists.
- Multiple frontends may potentially observe the same session.
- Interactive input arbitration needs explicit rules.

---

## 6. Active Client / Focus Switching

One idea worth exploring is automatic handoff based on focus.

Example:

- VS Code is focused → VS Code integration becomes the active interactive client.
- Ghostty becomes focused → Ghostty becomes the active interactive client.
- Focus returns to VS Code → control returns there.

This is **not yet a confirmed requirement**.

Questions that still need grooming:

- Should switching happen automatically on focus?
- Should a client explicitly request control?
- Can several clients send input simultaneously?
- Should inactive clients remain read-only?
- What happens when focus information is unreliable?
- Should manual pinning override automatic focus behavior?

A likely safe model is to separate:

1. **attached clients**
2. **active input client**
3. **session owner/backend**

but this should be validated before implementation.

---

## 7. Running Commands and Terminal Semantics

A key requirement is that when something is launched through the VS Code-side integration, it should behave as closely as possible to something launched from a normal VS Code terminal.

This matters for:

- environment variables;
- current working directory;
- shell configuration;
- child processes;
- signals;
- stdin/stdout;
- terminal capabilities;
- interactive applications.

At the same time, embedding a complex TUI such as Herdr directly inside VS Code's integrated terminal has already shown practical issues with:

- mouse capture;
- click delivery after focus changes;
- clipboard behavior;
- terminal/editor focus interaction.

The project should therefore avoid assuming that "just launch the TUI inside xterm.js" is the final UX.

---

## 8. VS Code Integration

A VS Code extension is a likely component.

Its responsibilities may include:

- discovering/running the local backend;
- listing available sessions;
- attaching to a session;
- displaying session state/output;
- forwarding user input;
- opening the same session in an external terminal;
- communicating focus/active-client state;
- exposing lightweight workspace commands.

The extension should ideally communicate with the backend directly rather than scraping or controlling a terminal UI.

### Local IPC

A Unix domain socket is a promising option for communication between the VS Code extension and the local backend.

Reasons:

- local-only by default;
- no TCP port allocation;
- avoids common "port already occupied" issues;
- filesystem permissions can restrict access;
- natural fit for one local daemon/service.

However, a Unix socket does **not** eliminate connection-management concerns.

The implementation still needs to handle:

- backend restarts;
- stale socket files;
- dropped connections;
- reconnects;
- multiple simultaneous clients;
- client crashes;
- protocol/version mismatch.

These are normal lifecycle concerns rather than reasons to avoid Unix sockets.

---

## 9. Herdr Integration

Before implementing major functionality, inspect Herdr's architecture and existing plugins/integrations.

The important question is:

> Can this project act as another client of Herdr's backend/session layer rather than wrapping the Herdr TUI itself?

This is preferable if Herdr already exposes enough primitives.

Areas to investigate:

- how Herdr plugins communicate with the backend;
- whether a stable local API exists;
- session lifecycle APIs;
- event/output streaming;
- input submission;
- cancellation;
- session metadata;
- reconnection behavior;
- authentication/authorization assumptions;
- whether multiple clients per session are supported.

### Preferred direction

If the backend API is sufficient:

**VS Code extension / Ghostty client → Herdr backend/session APIs**

rather than:

**VS Code extension → embedded terminal → Herdr TUI → backend**

The TUI should be treated as one possible frontend, not necessarily the integration boundary.

---


## Research Notes — Verified Current Behavior

This section records facts that have already been checked against the current Herdr and VS Code documentation.

These are **research notes, not product requirements**. Their purpose is to avoid repeating the same investigation and to make clear which assumptions are already supported by existing capabilities.

### Herdr already has the desired server/client split

Herdr is already built as a background session server with one or more attached clients.

The server owns:

- terminal panes and their PTYs;
- running shell/agent processes;
- workspace/tab/pane state;
- agent/session metadata.

Clients attach to that server to render and interact with the session.

Detaching or closing a terminal client does not normally stop the server or the processes running inside its panes.

This means the project should **not begin by designing a second persistence/session daemon**. The first assumption to validate should instead be:

> Can the VS Code integration be another Herdr client?

Herdr also already supports multiple attached clients. Different clients can view different tabs. When multiple clients interact with the same tab, Herdr already has coordination rules for which client controls pane sizing.

### Herdr already supports direct terminal attachment

Herdr provides direct attachment to a server-owned terminal:

```text
herdr agent attach <target>
herdr terminal attach <terminal_id>
```

This attaches the current terminal directly to one server-owned terminal rather than opening the complete Herdr workspace UI.

Relevant existing behavior:

- the current terminal receives the rendered terminal state and then live terminal frames;
- input is sent back to the server-owned terminal;
- the underlying process remains owned by the Herdr server;
- one writable direct-attach client owns input/resize;
- another direct attach is rejected unless takeover is explicitly requested.

This is very close to the desired "same session, different frontend" model.

The existing **single writer + explicit takeover** behavior is therefore a useful reference for our own client-switching UX. We should not invent a separate locking model until we understand whether Herdr's existing ownership mechanism can be reused.

### Herdr local Socket API

Herdr exposes a local API intended for custom tools and protocol clients.

Current transport:

- Unix domain socket on Unix/macOS/Linux;
- named pipe on Windows;
- newline-delimited JSON request/response messages;
- long-lived connections for event subscriptions.

Default Unix socket locations:

```text
~/.config/herdr/herdr.sock
~/.config/herdr/sessions/<name>/herdr.sock
```

The socket can also be resolved through Herdr's session/environment mechanisms.

The API exposes operations for:

- workspaces;
- tabs;
- panes;
- agents;
- input;
- pane reads;
- lifecycle/status information;
- session snapshots;
- event subscriptions;
- plugins/integrations;
- server control.

The installed Herdr binary can export the protocol schema:

```text
herdr api schema
herdr api schema --json
herdr api schema --output herdr-api.schema.json
```

This is important for the VS Code client: protocol types should preferably be generated or validated against Herdr's own schema rather than manually duplicated.

### Snapshot + event subscription model

Herdr already exposes a useful model for building another stateful UI.

`session.snapshot` returns a bootstrap view containing, among other things:

- workspaces;
- tabs;
- panes;
- layouts;
- agents;
- focus state;
- protocol/version metadata.

`events.subscribe` provides subsequent lifecycle updates.

Herdr documentation explicitly describes the safe bootstrap pattern:

1. subscribe to events;
2. wait for the subscription acknowledgement;
3. request the session snapshot;
4. install the snapshot locally;
5. apply events buffered while the snapshot was being fetched;
6. continue consuming the event stream.

After reconnecting, a client should obtain a fresh snapshot before trusting its local cache.

This is likely the right basis for a VS Code sidebar/editor UI.

### Important limitation: Socket API != full direct-terminal attach protocol

The public JSON Socket API is broad, but Herdr's **direct terminal attach** and some internal same-install operations use a separate numbered/binary protocol.

The current docs explicitly distinguish this internal protocol from the public JSON API.

Therefore we should **not yet assume** that a custom VS Code UI can recreate the complete interactive terminal client only from:

- `session.snapshot`;
- `events.subscribe`;
- `pane.read`;
- `pane.send_input`.

The JSON API is clearly sufficient for session/workspace management, agent status, commands, input, snapshots, and event-driven UI state.

It is not yet confirmed that it exposes the same continuous rendered ANSI frame stream used by `herdr terminal attach`.

This is one of the most important remaining technical investigations.

Possible directions to evaluate later:

- whether the direct-attach protocol can be consumed as a supported interface;
- whether Herdr should expose a stable terminal-stream API;
- whether a thin wrapper around `herdr terminal attach` is sufficient;
- whether the VS Code integration actually needs a full terminal renderer at all.

Do not choose one before validating the current Herdr API.

### Herdr persistence semantics

There are several distinct persistence cases.

#### Client detach / reattach

This is the strongest case:

- the Herdr server stays alive;
- pane PTYs and their processes stay alive;
- the agent/session simply continues running.

This is the main behavior the proposed workflow should rely on.

#### Full Herdr server restart

A full server restart is different:

- arbitrary running processes do not survive;
- Herdr restores workspace/tab/pane structure;
- supported coding agents can resume their own conversation through native session restore if Herdr has a valid session reference from an official integration.

Herdr currently supports native session restore for agents including Codex and Claude Code.

This distinction matters: **session continuity across UI switches is easy because the server stays alive; process continuity across a server crash/restart is a separate problem.**

#### Live server handoff

Herdr also has an experimental live-handoff mechanism used for some server replacement/update flows.

It attempts to transfer live PTYs/process ownership to a replacement server.

However, transient coordination such as:

- API connections;
- subscriptions;
- in-flight requests;
- waits

may be interrupted.

Clients are expected to reconnect and rebuild state.

This reinforces the idea that the VS Code integration should treat reconnect + fresh snapshot as a normal lifecycle path.

### Herdr agent integrations

Herdr agent integrations do not all work in exactly the same way.

Herdr can determine agent state through combinations of:

- terminal/process detection;
- lifecycle hooks/plugins;
- native session identity reporting.

For supported agents, integrations may report a native agent session ID/path. Herdr stores this association with the pane and can use it for native resume after a full server restart.

For this project, Herdr should remain the authority for agent detection/session identity where possible. The VS Code extension should consume that state rather than building a second independent Codex/Claude detection system.

### VS Code can connect directly to a Unix socket

Desktop VS Code has a **local Node.js extension host**.

Node's standard `node:net` API supports IPC clients via Unix domain socket paths on Unix/macOS/Linux.

Therefore, for the local desktop use case, a VS Code extension can directly connect to the Herdr Unix socket without introducing localhost HTTP/TCP purely for transport.

Conceptually:

```text
VS Code extension (Node extension host)
            │
            │ node:net / Unix domain socket
            ▼
      Herdr session server
```

This is a normal supported capability of the runtime rather than a terminal hack.

### Unix socket lifecycle considerations

Using a Unix socket removes TCP port allocation from the design, but it does **not** mean connection lifecycle disappears.

Expected conditions still include:

- server not running;
- connection refused / socket path missing;
- connection dropping because the server exits or restarts;
- stale filesystem socket paths after abnormal termination, depending on how the server manages them;
- multiple clients connected at once;
- protocol mismatch after upgrades.

A Unix domain socket is not "occupied" in the same way as choosing an arbitrary TCP port for each client.

There is normally one server bound to a particular socket pathname, and multiple clients can connect to that server if the server supports them.

Herdr already owns and manages its session socket namespaces, so the VS Code extension should preferably **connect to Herdr's socket rather than create another competing socket endpoint**.

### VS Code local vs remote extension host

A caveat matters for future WSL/SSH/Dev Container support.

VS Code extensions can run in different extension hosts:

- local Node.js extension host;
- remote Node.js extension host;
- browser/web extension host.

The Unix socket is only reachable from the machine/environment where that socket exists.

Therefore:

- local VS Code + local Herdr is straightforward;
- remote workspace + remote Herdr likely requires the extension/backend-facing portion to run in the remote/workspace extension host;
- a browser-only VS Code extension cannot directly use Node's Unix-socket APIs.

This does not need to be solved in the first local-only iteration, but the extension architecture should avoid assuming that "VS Code UI machine" and "Herdr server machine" are permanently the same thing.

### Current research implication

Based on what is already implemented in Herdr, the lowest-risk initial architecture is now:

```text
                      Herdr server
             (session + panes + PTYs + agents)
                         /      \
                        /        \
          Herdr terminal UI      VS Code extension
                                (another client)
```

A new broker/daemon should be introduced only if a concrete missing capability requires it.

The main unknown is no longer session persistence.

The main unknown is:

> What is the cleanest supported way for a VS Code client to obtain full interactive terminal rendering/input semantics when needed?

For non-terminal UI such as:

- workspace lists;
- agent status;
- navigation;
- session switching;
- notifications;
- actions;

the existing JSON socket API already appears to provide most of the required primitives.

### Research sources

Verified against the current documentation on 2026-09-15:

- Herdr — Concepts: `https://herdr.dev/docs/concepts/`
- Herdr — Socket API: `https://herdr.dev/docs/socket-api/`
- Herdr — Session state and restore: `https://herdr.dev/docs/session-state/`
- Herdr — Agents: `https://herdr.dev/docs/agents/`
- Herdr — Agent automation: `https://herdr.dev/docs/agent-automation/`
- Herdr — CLI reference: `https://herdr.dev/docs/cli-reference/`
- VS Code — Extension Host: `https://code.visualstudio.com/api/advanced-topics/extension-host`
- Node.js — `node:net` IPC / Unix domain sockets: `https://nodejs.org/api/net.html`


## 10. Process / Backend Lifecycle

Research confirms that Herdr already provides the background server/session lifecycle required for the core concept.

Therefore the **default assumption for the first iteration is to reuse Herdr's server directly**, not to create a new daemon.

Desired behavior:

- Herdr starts or is discovered when needed;
- the VS Code extension discovers the relevant Herdr session/socket;
- Herdr remains alive independently from a specific VS Code window or terminal client;
- clients can disconnect/reconnect without terminating pane processes;
- the extension rebuilds its local state after reconnecting.

Still-open questions:

- how should the extension choose between the default and named Herdr sessions?
- should the extension automatically start Herdr when no server exists?
- how should workspace → Herdr workspace/session association be represented?
- is any thin adapter actually required for terminal streaming, or can Herdr expose/reuse the needed attach primitive directly?
- what upgrade/protocol compatibility policy should the extension use?

A separate broker should be treated as a fallback solution for a demonstrated gap, not as part of the initial architecture.

---

## 11. Multiple Clients

The architecture should assume that more than one client may be connected.

Examples:

- VS Code + Ghostty;
- two VS Code windows;
- a future mobile/web client;
- a monitoring/read-only UI.

This does **not** imply that every client must be allowed to type simultaneously.

A robust protocol should distinguish session events from client-specific state.

Potential client-specific state:

- focus;
- UI dimensions;
- scroll position;
- active/read-only status;
- capabilities.

Potential session state:

- agent conversation;
- running turn;
- tool executions;
- output/events;
- working directory/workspace association.

---

## 12. Interaction During Client Switching

A running agent turn should not normally be interrupted simply because the active UI changed.

Preferred behavior:

- allow the current turn/process to continue;
- new active client receives its output/state;
- cancellation remains possible from the active client;
- queued/follow-up input should not be lost during handoff.

The exact semantics need grooming, especially when switching occurs while:

- a tool is waiting for terminal input;
- an approval is pending;
- a full-screen TUI owns the PTY;
- a user has partially typed input in one frontend.

---

## 13. Non-Goals for the First Iteration

Unless required by an architectural constraint, the first version should **not** try to:

- build a new terminal emulator;
- reimplement all Herdr features;
- create a generic cloud agent platform;
- replace VS Code's terminal subsystem;
- support every agent/runtime immediately;
- solve remote/mobile access;
- provide complex multi-user collaboration.

The first useful milestone is a strong local single-user workflow.

---

## 14. Suggested Initial Scope

A reasonable first slice to validate the architecture:

1. Start or discover a local backend.
2. Create/list persistent sessions.
3. Attach a lightweight client to one session.
4. Stream session events/output.
5. Send input/actions to the session.
6. Disconnect and reconnect without losing the session.
7. Attach a second client to the same session.
8. Define simple active-client arbitration.
9. Build a minimal VS Code extension using the same protocol.
10. Validate switching between VS Code and a standalone terminal.

This milestone should prove the session model before investing heavily in UI.

---

## 15. Open Questions

These are intentionally unresolved.

### Herdr

- Is Herdr's backend API intended/stable enough for third-party clients?
- Can a client attach to an already-running Herdr session?
- Can multiple clients attach?
- Are existing Herdr plugins good references for the protocol?
- Is Herdr itself enough as the backend, or is a broker needed?

### VS Code

- Custom editor, webview, terminal, or another surface?
- How much terminal emulation is actually necessary?
- Can focus state be observed reliably enough for automatic handoff?
- Should there be an explicit "Take control" action?

### Session model

- What identifies a session?
- How is a session associated with a workspace?
- Does the backend survive logout/reboot?
- What is persisted vs only kept in memory?
- What happens after backend crashes?

### Input arbitration

- One writer / many readers?
- Focus-based writer selection?
- Explicit locks?
- How are pending prompts or approvals transferred?

### IPC

- Unix socket directly?
- Existing Herdr transport?
- Thin local HTTP/WebSocket API?
- How are protocol versions negotiated?

---

## 16. Architectural Direction — Current Best Hypothesis

Research now confirms that Herdr itself already implements the core server/client and persistent-session model.

The current preferred direction is therefore:

```text
                 ┌───────────────────────────┐
                 │       Herdr server        │
                 │                           │
                 │ sessions / workspaces     │
                 │ tabs / panes / PTYs       │
                 │ agent state + identity    │
                 └─────────────┬─────────────┘
                               │
                  Herdr local interfaces
                  JSON socket API + attach
                               │
              ┌────────────────┼────────────────┐
              │                │                │
       ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼─────┐
       │ VS Code     │  │ Herdr        │  │ future    │
       │ extension   │  │ terminal UI  │  │ clients   │
       └─────────────┘  └─────────────┘  └───────────┘
```

The VS Code extension should initially be designed as **another Herdr client**, not as the owner of an agent session and not as a second session backend.

A separate local broker/daemon should only be introduced if a specific missing capability cannot reasonably be added to or consumed from Herdr.

The main architectural boundary remains:

> **clients attach to server-owned sessions and terminals; sessions do not belong to clients.**

The largest unresolved boundary is the full terminal stream: the public JSON API is already suitable for state/control UI, while the existing direct-attach terminal stream currently uses a separate protocol that still needs investigation.

---

## 17. Guidance for Further Grooming

Before writing substantial production code:

1. export/read the current Herdr API schema and map the exact primitives needed by the VS Code client;
2. build a tiny Node/TypeScript proof-of-concept that connects from a VS Code extension host to the Herdr Unix socket;
3. bootstrap client state using `events.subscribe` + `session.snapshot`;
4. validate reconnect behavior by intentionally restarting/disconnecting the client;
5. verify how much of the desired UI can be implemented using the public JSON API alone;
6. specifically investigate the full terminal/direct-attach stream boundary;
7. compare the required input-ownership UX with Herdr's existing single-writer / takeover model;
8. only introduce a separate broker if a concrete capability gap remains;
9. keep rich VS Code UI work minimal until the protocol boundary is proven.

When a choice is not yet validated, prefer leaving a clear interface or TODO rather than encoding the current hypothesis as a permanent architectural assumption.

---

## 18. Success Criteria for the Concept

The concept is successful when this workflow feels natural:

> Start an agent session while working in VS Code → continue it in Ghostty → return to VS Code → nothing restarts, no context is lost, and the user does not have to care which frontend originally created the session.

Everything else should serve that goal.
