# Herdr как основа для VS Code extension

**Дата исследования:** 2026-09-15
**Установленная версия:** Herdr 0.9.0 (локальные первичные артефакты)
**Граница уверенности:** факты с пометкой **0.9.0** взяты из локальных CLI/schema; **web-current** — из текущих first-party docs; при расхождении приоритет у локального бинаря и его schema.

## Резюме

Herdr уже является нужным session backend: detached background server владеет workspace/tab/pane, PTY и процессами, а клиенты attach/detach. Поэтому первый вариант должен быть **VS Code extension как ещё один Herdr client**, а не новый daemon. При обычном detach PTY и agent не останавливаются; server restart восстанавливает только форму layout, а native agent conversation — только если официальный integration сообщил session reference. [Session state](https://herdr.dev/docs/session-state/)

Публичный Socket API 0.9.0 хорошо покрывает state/control UI: snapshot, event subscriptions, workspace/tab/pane/layout/worktree/agent/metadata/plugin operations. Он не является полноценным terminal-frame stream: непрерывный экранный поток вынесен в поддерживаемый CLI `herdr terminal session observe|control`, который выдаёт NDJSON `terminal.frame` с base64 ANSI bytes. Для xterm.js это реалистичная граница PoC; прямой numbered binary protocol использовать не следует — current docs называют его same-install/internal. [Socket API](https://herdr.dev/docs/socket-api/), [Persistence and remote access](https://herdr.dev/docs/persistence-remote/)

Ключевое UX-требование «терминалы Space отдельными tabs над дефолтными tabs VS Code» официальный VS Code API не даёт: extension может создать terminal в Panel или обычной editor tab/group, но отдельный дополнительный tab strip/произвольную placement surface не экспонирует. Нужны компромиссы: один custom Webview/Editor panel с собственной строкой Spaces/terminals, обычный VS Code terminal group, TreeView + один terminal, либо external Ghostty/Herdr для native terminal UX. [VS Code API](https://code.visualstudio.com/api/references/vscode-api), [Webview API](https://code.visualstudio.com/api/extension-guides/webview)

## 1. Что именно проверено в PRD

`docs/agent-workspace-working-prd.md` прочитан полностью. Его основная гипотеза — «session first, UI second», backend ownership и attach/detach — уже реализована Herdr. Следовательно, PRD правильно запрещает начинать с нового persistence daemon. Но PRD пока смешивает подтверждённые Herdr свойства с желаемой семантикой клиента:

| Идея/неизвестное PRD | Текущее заключение |
|---|---|
| Session живёт независимо от frontend | **Подтверждено** обычным Herdr server/client lifecycle. [Concepts](https://herdr.dev/docs/concepts/) |
| Detach/reconnect без потери процесса | **Подтверждено** при живом server. Это не равно server restart. [Session state](https://herdr.dev/docs/session-state/) |
| Несколько клиентов | **Подтверждено web-current для Herdr UI/direct attach**, но семантику нескольких custom JSON clients и их UI lease надо экспериментально проверить. |
| Active client/focus handoff | У Herdr есть direct-attach single-writer/takeover и schema `client_shell.surface.set`; автоматический VS Code/Ghostty focus handoff как PRD-поведение не подтверждён. **Needs experiment/design.** |
| State UI через snapshot/events | **Подтверждено 0.9.0**; bootstrap должен сначала subscribe, затем snapshot, затем применить buffered events. [Socket API](https://herdr.dev/docs/socket-api/) |
| Полный interactive terminal через JSON Socket API | **Не подтверждено; скорее нет**: JSON API даёт `pane.read`/input и revision events, а full ANSI stream — отдельный CLI controller. |
| Unix socket как IPC | **Подтверждено** для Unix/macOS/Linux; Windows — named pipe. Node `node:net` это поддерживает. [Socket API](https://herdr.dev/docs/socket-api/), [Node net IPC](https://nodejs.org/api/net.html#ipc-support) |
| «Как нормальный VS Code terminal» env/cwd/signals/PTY | Herdr pane действительно real terminal/PTY, но webview/xterm bridge добавляет слой; полноценное совпадение terminal semantics надо проверять. |
| Workspace↔Herdr association | Herdr workspace имеет cwd/worktree provenance, но PRD-specific association с VS Code workspace не задана. Нужен extension-owned mapping. |
| Persistence после crash/reboot | **Ограничено:** server restart убивает произвольные processes; layout restore и native agent restore — отдельные функции. «Restart machine brings layout back» в marketing/docs не означает сохранение PID. |

## 2. Архитектура и persistence

### 2.1 Server/client

- Herdr — background session server плюс один или несколько terminal clients; panes keep running inside server, clients render and interact. [Concepts](https://herdr.dev/docs/concepts/)
- При обычном detach (`Ctrl+B Q`) client исчезает, но server, shell/agent/test/server processes и PTY остаются живыми; reattach показывает live screen. Это наиболее сильная continuity path. [Session state](https://herdr.dev/docs/session-state/)
- Named session — отдельная runtime namespace со своими panes, tabs, workspaces, sockets и runtime state, но общей global config. Локальные пути current docs: `~/.config/herdr/herdr.sock` и `~/.config/herdr/sessions/<name>/herdr.sock`. [Persistence and remote access](https://herdr.dev/docs/persistence-remote/)
- Workspaces — project-level grouping; tabs — groups of panes; panes — server-owned terminal locations. Public pane IDs вида `w1:p1`, terminal IDs отдельны. **0.9.0:** schema `PaneInfo` требует `pane_id`, `terminal_id`, `workspace_id`, `tab_id`, `focused`, `agent_status`, `revision` (`/tmp/herdr-0.9.0-api-schema.json`, `schemas.event.$defs.PaneInfo`).

### 2.2 Точная семантика persistence

| Ситуация | Processes/PTY | Layout/focus | Screen | Agent conversation |
|---|---:|---:|---:|---:|
| Client detach/reattach | Да | Да | Да, live | Да, process не останавливался |
| Full server restart | Нет для arbitrary processes | Да: workspace/tab/pane/cwd/layout/focus | Только если включён pane history | Только native session restore |
| Update без `--handoff` | Compatible server может остаться; restart-required заменяет server с риском stop | Да после restart | Только history | Только native restore |
| Experimental `--handoff` | Best effort: live PTY/process ownership переносится | Да | Live при успехе | Да при сохранении process |

Источник таблицы: [Session state and restore](https://herdr.dev/docs/session-state/). Следствие для extension: нельзя обещать «сессия не рестартует» при shutdown/crash Herdr. Надёжный UX должен различать `attached`, `server alive`, `restored`, `agent resumed`.

- **Pane screen history:** off by default из-за secrets/tokens/prompts; при включении `[experimental] pane_history = true` сохраняется `session-history.json`. Это восстановление экрана, не процесса. [Session state](https://herdr.dev/docs/session-state/)
- **Native agent restore:** включено по умолчанию (`[session] resume_agents_on_restore = true`), но требует valid native reference от current official integration и соответствующей launch/resume capability. Невалидный/missing/stale reference даёт обычный shell в saved cwd. [Session state](https://herdr.dev/docs/session-state/)
- **Live handoff:** experimental replacement flow сохраняет long-lived PTY/process/agent/plugin state при успехе, но прерывает requests, waits, subscriptions, client sockets и другие transient coordination; clients должны reconnect и rebuild snapshot. [Session state](https://herdr.dev/docs/session-state/)
- **`layout.apply` не persistence handoff:** создаёт fresh tab и запускает новые panes; сохраняет shape/labels/cwd/env/argv, но не live PTY, scrollback или running processes. [Socket API](https://herdr.dev/docs/socket-api/)

### 2.3 Remote machines/SSH

Herdr может подключать машины через SSH; каждая machine имеет собственный server, sessions и running processes. Saved profile хранит label, SSH target, explicit remote session и enabled state, но не credentials/private keys; auth остаётся у OpenSSH. [Connecting machines](https://herdr.dev/docs/connecting-machines/)

- `herdr --remote` — local thin client к remote server; `ssh host` затем `herdr` — полностью remote client/server.
- Current support: Linux/macOS clients к Linux/macOS hosts; standalone remote attach поддерживается с Windows client, но native Windows host/server как SSH target не поддерживается. Saved multi-machine connections не verified/supported on Windows. [Persistence and remote access](https://herdr.dev/docs/persistence-remote/), [Connecting machines](https://herdr.dev/docs/connecting-machines/)
- Для extension v1 лучше local-only. Remote VS Code требует, чтобы Node extension host находился в окружении, где существует Herdr socket: local/remote hosts — Node; web extension — Browser и Unix socket недоступен. [VS Code Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)

## 3. Capability map

| Область | Уже есть у Herdr | Что получает extension |
|---|---|---|
| Sessions | default + named sessions, отдельные sockets/runtime; `session list/attach/stop/delete` | Discover/choose socket; не считать session name workspace ID |
| Workspaces/Spaces | create/list/get/focus/rename/move/reorder/metadata/close; rollup agent state | Native TreeView «Spaces» и commands |
| Tabs | create/list/get/focus/rename/move/close | Tree children или own webview tab model |
| Panes | split/swap/move/zoom/layout/process info/focus/resize/scroll/read/input/close | State and control; pane moves may change public pane ID cross-workspace |
| Layout | export BSP tree; apply declarative tree; split ratio | Rebuild overview, но apply не attach к existing PTY |
| PTY/terminal | server-owned real terminal panes; process/cwd/foreground process; text/ANSI read; text/key input | State/automation directly; live screen via CLI controller, not JSON API |
| Worktrees | Git create/open/list/remove, grouped workspace provenance | PRD «space per branch» strongly supported |
| Agents | detection + lifecycle/session integrations; states `idle, working, blocked, done, unknown`; many agent kinds | Agents view/status, prompt/wait/read/send keys, native resume metadata |
| Notifications | configured Herdr/terminal/system/off delivery, title/body/sound/rate limits | Can trigger Herdr toast; VS Code can independently use `showInformationMessage`/`showWarningMessage` |
| Plugins | manifest package; startup/action/event hooks/link handlers/terminal panes; CLI/socket callbacks; no sandbox | Use Herdr plugin for agent/workflow integration, not native VS Code UI |
| Integrations | official integration install/uninstall/status; lifecycle authority vs session identity | Do not duplicate detector; consume Herdr authority |
| Config/keybindings | TOML, prefix mode, custom commands, tab/sidebar/toast/layout settings, reload | Read/offer commands; do not silently rewrite user config |
| Automation/CLI | shell scripts and agent automation; `pane run`, wait, agent prompt/wait; JSON where supported | Lowest-coupling control layer; subprocess fallback |
| Snapshot/events/API | versioned schema, request/response and long-lived subscriptions | Correct basis for local cache and reconnect |

Источники: [Socket API](https://herdr.dev/docs/socket-api/), [Agent automation](https://herdr.dev/docs/agent-automation/), [Agents](https://herdr.dev/docs/agents/), [Plugins](https://herdr.dev/docs/plugins/), [Configuration](https://herdr.dev/docs/configuration/).

### Agents/detection details

Current docs list detection for Pi, OMP, Copilot, Devin, Kimi, Hermes, Qoder, Qwen, Droid, OpenCode, Kilo, MastraCode, Claude Code, Codex, Cursor Agent CLI, Grok, Antigravity CLI, Amp, Kiro, Maki, Muse; Gemini CLI/Cline are detected but less thoroughly tested. Unsupported processes still run as terminal processes, but may lack rich state. [Agents](https://herdr.dev/docs/agents/)

State authority varies: lifecycle hooks/plugins are authoritative for Pi/OMP/Kimi/OpenCode/Kilo/MastraCode when installed and reporting; many other integrations provide session identity while screen-manifest detection remains state authority. `agent_status` is semantic and drives waits/notifications/rollups; `done` means idle and unseen; `unknown` is not completion. [Integrations](https://herdr.dev/docs/integrations/), [Agent automation](https://herdr.dev/docs/agent-automation/)

**0.9.0 schema:** `AgentInfo` exposes `interactive_ready`, `launch_pending`, `screen_detection_skipped`, `state_change_seq`, optional `agent_session {source, agent, kind: id|path, value}`, `foreground_cwd`, title and metadata tokens (`/tmp/herdr-0.9.0-api-schema.json`, `schemas.success_response.$defs.AgentInfo`).

## 4. Socket API 0.9.0 — detailed map

### 4.1 Wire, discovery and bootstrap

**0.9.0 facts:**

- `protocol: 22`, `schema_version: 1` are top-level properties of `/tmp/herdr-0.9.0-api-schema.json`.
- Local `herdr status` snapshot reports client/server `0.9.0`, `protocol: 22`, `endpoint_protocol_generation: 1`, endpoint compatible, socket `/Users/kuzmichev/.config/herdr/herdr.sock`; source: `/tmp/herdr-0.9.0-cli.txt`, command `herdr status`.
- Wire is newline-delimited JSON over local socket: Unix domain socket on Unix/macOS/Linux, named pipe on Windows. One request per line; response echoes request `id`; subscriptions keep connection open. [Socket API](https://herdr.dev/docs/socket-api/)
- Discovery precedence current docs: explicit CLI `--session`, `HERDR_SOCKET_PATH`, `HERDR_SESSION`, default socket. Named socket paths: `~/.config/herdr/sessions/<name>/herdr.sock`. [Socket API](https://herdr.dev/docs/socket-api/)
- Node `net.createConnection(path)` supports Unix IPC and Windows named pipes. Unix pathname length is OS-limited; Node notes a crash can leave a filesystem socket path until unlinked. [Node net IPC](https://nodejs.org/api/net.html#ipc-support)
- Request envelope requires string `id`; method-specific `params` required by every schema `request.oneOf` variant. Success is `{id,result}`; error is `{id,error:{code:string,message:string}}`. `/tmp/herdr-0.9.0-api-schema.json`, `schemas.error_response`, `schemas.success_response`.

**Correct bootstrap (no event gap):** open `events.subscribe` on a connection, await `subscription_started`, buffer pushed events, then call `session.snapshot` (possibly on another connection), install snapshot, apply buffered events in order, and continue. Subscription does not replay events; after reconnect always obtain a fresh snapshot. [Socket API](https://herdr.dev/docs/socket-api/)

**Compatibility:** current docs say endpoint generation 1 clients negotiate snapshot/screen/input/blob codecs, server advertises methods/capabilities, and JSON clients should ignore unknown fields and treat unsupported methods as normal errors. `ping` returns version/protocol and optional `ServerCapabilities`; schema fields are `detached_server_daemon`, `endpoint_protocol_generation`, `health_check`, `live_handoff`, `surface_interest`. `/tmp/herdr-0.9.0-api-schema.json`, `schemas.success_response.$defs.ServerCapabilities`; [Socket API](https://herdr.dev/docs/socket-api/)

This is not a full promise that every raw API method is semantically stable forever. For production extension: call `ping`, require protocol/schema-compatible minimum, feature-detect methods/capabilities, validate against installed `herdr api schema --json`, and keep a reconnect path.

### 4.2 Public request methods in installed schema

The following is the exact method inventory represented by `schemas.request.oneOf` in `/tmp/herdr-0.9.0-api-schema.json` (grouped for readability):

| Group | Methods |
|---|---|
| Server | `ping`, `server.stop`, `server.live_handoff`, `server.reload_config`, `server.agent_manifests`, `server.reload_agent_manifests` |
| Notifications/client | `notification.show`; `client.window_title.set`, `client.window_title.clear`; `product_announcement.dismiss`, `release_notes.dismiss` |
| Client shell/session | `command.invoke`; `client_shell.surface.set`; `session.snapshot` |
| Workspace | `workspace.create`, `workspace.list`, `workspace.get`, `workspace.focus`, `workspace.rename`, `workspace.move`, `workspace.move_block`, `workspace.report_metadata`, `workspace.close` |
| Worktree | `worktree.list`, `worktree.create`, `worktree.open`, `worktree.remove` |
| Tab | `tab.create`, `tab.list`, `tab.get`, `tab.focus`, `tab.rename`, `tab.move`, `tab.close` |
| Agent | `agent.list`, `agent.get`, `agent.read`, `agent.explain`, `agent.send_keys`, `agent.rename`, `agent.view.set`, `agent.view.clear`, `agent.focus`, `agent.start`, `agent.prompt`, `agent.wait` |
| Pane topology/control | `pane.split`, `pane.swap`, `pane.move`, `pane.zoom`, `pane.layout`, `pane.process_info`, `pane.neighbor`, `pane.edges`, `pane.focus_direction`, `pane.resize`, `pane.scroll`, `pane.edit_scrollback`, `pane.selection.read`, `pane.copy_motion`, `pane.copy_search`, `pane.list`, `pane.current`, `pane.get`, `pane.focus`, `pane.input.set`, `pane.link.activate`, `pane.rename`, `pane.send_text`, `pane.send_keys`, `pane.send_input`, `pane.read`, `pane.close`, `pane.wait_for_output` |
| Pane graphics | `pane.graphics.info`, `pane.graphics.set`, `pane.graphics.clear`, `pane.graphics.stream` |
| Agent/metadata reporting | `pane.report_agent`, `pane.report_agent_session`, `pane.report_metadata`, `pane.clear_agent_authority`, `pane.release_agent` |
| Layout | `layout.export`, `layout.apply`, `layout.set_split_ratio` |
| Popup/events | `popup.close`; `events.subscribe`, `events.wait` |
| Integrations | `integration.list`, `integration.install`, `integration.uninstall` |
| Plugins | `plugin.link`, `plugin.list`, `plugin.unlink`, `plugin.enable`, `plugin.disable`, `plugin.action.list`, `plugin.action.invoke`, `plugin.log.list`, `plugin.pane.open`, `plugin.pane.focus`, `plugin.pane.close` |

The current web docs present the same method groups and explain many parameters. [Socket API](https://herdr.dev/docs/socket-api/)

### 4.3 Important request/response semantics

- **Snapshot:** `session.snapshot` returns `version`, `protocol`, arrays `workspaces`, `tabs`, `panes`, `layouts`, `agents`, plus focused workspace/tab/pane IDs. It is one-time bootstrap, not subscription. `/tmp/herdr-0.9.0-api-schema.json`, `schemas.success_response.$defs.SessionSnapshot`.
- **Workspace/tab/pane:** create responses return new records; IDs are server-scoped. Workspace records include label, number, focused, counts, active tab, rollup status, tokens and optional worktree provenance. Tab records include label/focus/count/status. Pane records include terminal ID/cwd/focus/status/revision and optional agent/title/scroll/tokens. `/tmp/herdr-0.9.0-api-schema.json`, `schemas.success_response.$defs.{WorkspaceInfo,TabInfo,PaneInfo}`.
- **Worktree:** raw `cwd`/`path` must be absolute; CLI expands relative paths. Create/open returns workspace/tab/root_pane/worktree. `worktree.remove` removes linked checkout through Git and does not delete branch. [Socket API](https://herdr.dev/docs/socket-api/)
- **Layout:** `layout.export` gives portable BSP tree (`pane`/`split`, right/down, ratio); `layout.apply` recreates panes, not live processes. `pane.layout` gives rects, split ratios, focus and zoom. `/tmp/herdr-0.9.0-api-schema.json`, layout request/response definitions.
- **Input:** `pane.send_text` literal text; `pane.send_keys` logical key strings; `pane.send_input` can carry text and/or keys. Supported keys include `enter`, `esc`, modifier chords, function keys and named punctuation; `prefix+...` keybinding strings are not accepted. [Socket API](https://herdr.dev/docs/socket-api/)
- **Read:** `pane.read`/`agent.read` sources are `visible`, `recent`, `recent_unwrapped`, `detection`; format `text|ansi`; result carries text, revision, source, truncation. `/tmp/herdr-0.9.0-api-schema.json`, `ReadSource`, `ReadFormat`, `PaneReadResult`.
- **Agent:** `agent.start` requires name/kind/pane; `agent.prompt` can atomically submit and wait; `agent.wait` is event-driven and pins resolved occupant; blocked prompt returns `agent_blocked` without sending. [Agent automation](https://herdr.dev/docs/agent-automation/)
- **Metadata:** `pane.report_metadata`/`workspace.report_metadata` are display-only token/title/status-label patches, with source/sequence/TTL constraints. Semantic state remains integration/detection authority. Token maps in schema cap report sizes. [Socket API](https://herdr.dev/docs/socket-api/)
- **Graphics:** `pane.graphics.*` is image/Kitty-oriented (PNG/RGB/RGBA/BGRA, stream, layer/size/damage metadata), not terminal screen streaming. `kitty_graphics=false` returns `feature_disabled`. `/tmp/herdr-0.9.0-api-schema.json`, `PaneGraphics*`; [Configuration](https://herdr.dev/docs/configuration/)
- **`client_shell.surface.set`:** local schema says it updates whether the requesting client shell receives/controls pane presentation and returns `projection_revision`; capabilities include `surface_interest`. This looks relevant to an active-client lease but no current public guide gives enough semantics for a custom VS Code client. Treat as **schema-confirmed, behavior unknown; experiment before depending on it**. `/tmp/herdr-0.9.0-api-schema.json`, `ClientShellSurfaceSetParams`, response `client_shell_surface_set`.

### 4.4 Events and errors

**Lifecycle event kinds in installed schema:**

- Workspace: `workspace_created`, `workspace_updated`, `workspace_metadata_updated`, `workspace_closed`, `workspace_renamed`, `workspace_moved`, `workspace_reordered`, `workspace_focused`.
- Worktree: `worktree_created`, `worktree_opened`, `worktree_removed`.
- Tab: `tab_created`, `tab_closed`, `tab_renamed`, `tab_moved`, `tab_focused`.
- Pane: `pane_created`, `pane_closed`, `pane_updated`, `pane_focused`, `pane_moved`, `pane_output_changed`, `pane_exited`, `pane_agent_detected`, `pane_agent_status_changed`, `layout_updated` in `EventKind`; docs additionally describe `pane.output_matched` and `pane.scroll_changed` subscription payloads. `/tmp/herdr-0.9.0-api-schema.json`, `schemas.event.$defs.EventKind`, `schemas.subscription_event.$defs.SubscriptionEventKind`; [Socket API](https://herdr.dev/docs/socket-api/)

`events.subscribe` accepts typed filters. The installed schema’s `subscription_event` has pushed `pane.output_matched`, `pane.agent_status_changed`, and `pane.scroll_changed`; lifecycle event envelopes carry changed records/IDs. Pane output changes carry monotonically increasing `revision`, so a client can decide when to reread screen. `/tmp/herdr-0.9.0-api-schema.json`, `EventData`, `SubscriptionEventData`.

The schema intentionally does **not** enumerate error codes: `error.code` is arbitrary string. Confirmed docs/examples include `not_found`, `invalid_params`, `feature_disabled`, `stream_conflict`, `workspace_group_close_required`, `agent_blocked`, `agent_prompt_stalled`, `timeout`, `plugin_disabled`, `platform_unsupported`, `ui_busy`, `popup_not_open`, and notification reasons such as `rate_limited`; this is not an exhaustive catalog. [Socket API](https://herdr.dev/docs/socket-api/)

## 5. Direct terminal attach and streaming

### 5.1 What is public and what is internal

Do not reverse-engineer Herdr’s numbered binary protocol. Current official docs explicitly reserve it for same-install/internal operations including direct terminal attach and live handoff, and ask clients to check `ping`/`herdr status` across builds. [Socket API](https://herdr.dev/docs/socket-api/)

However, the **CLI bridge surface is explicitly documented for third-party bridges**:

```text
herdr terminal session observe <target> --cols 120 --rows 40
herdr terminal session control <target> --takeover --cols 120 --rows 40
```

- `observe` is read-only; prints NDJSON `terminal.frame` lines with base64 ANSI bytes, then `terminal.closed`. Multiple observers may watch the same terminal and cannot input/resize/scroll/takeover.
- `control` is writable; prints the same frame records and reads NDJSON commands from stdin: `terminal.input`, `terminal.resize`, `terminal.scroll`, `terminal.release`.
- One controller owns input and resize. `--takeover` explicitly replaces current owner.
- `herdr terminal attach <terminal_id>` and `herdr agent attach <target>` are human terminal clients: direct attach sends rendered current state then live ANSI frames, accepts input, and detaches with `Ctrl+B Q`. Direct attach is documented on Linux/macOS, not native Windows. [Persistence and remote access](https://herdr.dev/docs/persistence-remote/), [CLI reference](https://herdr.dev/docs/cli-reference/)

Therefore: **direct attach is a supported CLI protocol boundary, but not the same as a stable JSON Socket API method and not a public numbered wire protocol.**

### 5.2 xterm.js/VS Code suitability

A VS Code extension can launch `terminal session control` as a child process and bridge:

```text
terminal.frame.data (base64 decode -> ANSI bytes) -> xterm.js.write()
xterm.js.onData(data) -> {type:"terminal.input", ...} -> controller stdin
resize observer -> {type:"terminal.resize", cols, rows}
release/dispose -> {type:"terminal.release"}
```

This is a realistic **adapter PoC** because Herdr performs PTY ownership, screen rendering and input arbitration; xterm.js only renders. It still needs tests for frame cadence, initial full frame, terminal width/height, alternate screen, mouse reporting, bracketed paste, OSC/title, Unicode and reconnect. The CLI subprocess boundary adds buffering/quoting/process lifecycle coupling.

Do not implement a second local PTY and launch the agent independently: that would create a second session and violate PRD’s same-session guarantee.

### 5.3 Alternatives for terminal UX

| Approach | Render/input | Ownership | Coupling/stability | Assessment |
|---|---|---|---|---|
| JSON Socket API only | read snapshots/ANSI chunks + send input; no confirmed continuous rendered stream | No documented terminal controller lease | Best structured API, schema versioned; stream gap | Use for sidebar/state/control, not full TUI |
| `terminal session observe/control` subprocess | Full ANSI frames, input, resize, scroll | Explicit one-controller + takeover | Official CLI bridge; CLI stdout/NDJSON contract must be pinned/tested | Best first terminal PoC |
| `terminal attach`/`agent attach` wrapper | Full terminal behavior through current terminal | Same single writable owner/takeover | Human-oriented attach and likely harder to embed; direct attach platform limit | Useful fallback/external terminal |
| New upstream streaming API | Could expose stream in JSON/official client lib | Upstream-defined | Lowest long-term coupling, but requires upstream change/release | Request if PoC reveals wrapper limits |
| Thin adapter/broker | Adapter normalizes JSON + controller into extension protocol and owns reconnect | Adapter can expose explicit UI lease | Extra daemon/security/lifecycle; still coupled internally | Defer until concrete gap |

## 6. VS Code API and PRD UX

### 6.1 What official API supports

- **Agents/Spaces tree:** contribute a `TreeView` under a custom Activity Bar/Primary Sidebar/Panel view container; TreeView is intended for hierarchical data. [Contribution Points](https://code.visualstudio.com/api/references/contribution-points), [Views](https://code.visualstudio.com/api/ux-guidelines/views)
- **Notifications:** normal extension message APIs (`showInformationMessage`, `showWarningMessage`, `showErrorMessage`) and status bar/TreeView badges are native UX. Herdr `notification.show` remains useful for notifications visible in Herdr/Ghostty. [VS Code API](https://code.visualstudio.com/api/references/vscode-api), [Herdr Socket API](https://herdr.dev/docs/socket-api/)
- **Commands:** `vscode.commands.registerCommand`, `executeCommand`; context menus/view title actions via contribution points. [VS Code API](https://code.visualstudio.com/api/references/vscode-api)
- **WebviewView:** custom HTML UI in sidebar/panel; extension host ↔ webview `postMessage`. [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- **WebviewPanel/custom editor:** arbitrary HTML in a normal editor tab. Custom editor lifecycle is resource/document-oriented and webview-backed; it is not a new global tab-strip primitive. [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors), [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- **Pseudoterminal:** `window.createTerminal({name, pty})` with `Pseudoterminal.onDidWrite` for output and `open`, `close`, `handleInput`, `setDimensions`; output before `open` is ignored and line breaks should be `\r\n`. [VS Code API — Pseudoterminal](https://code.visualstudio.com/api/references/vscode-api#Pseudoterminal)
- **Terminal placement:** `ExtensionTerminalOptions.location` accepts `TerminalLocation.Panel`, `TerminalLocation.Editor`, an editor `viewColumn`, or a split relative to another terminal. A terminal can be shown in the editor area but remains a VS Code-managed terminal/editor tab. [VS Code API — ExtensionTerminalOptions](https://code.visualstudio.com/api/references/vscode-api#ExtensionTerminalOptions)
- **Terminal profile:** `window.registerTerminalProfileProvider` can contribute a profile, not a new terminal tab strip. [VS Code API — TerminalProfileProvider](https://code.visualstudio.com/api/references/vscode-api#TerminalProfileProvider)
- **Terminal observation:** public API exposes `window.terminals`, `activeTerminal`, terminal lifecycle/state events; there is no public `TerminalRenderer` API in current `vscode.d.ts`. [VS Code API](https://code.visualstudio.com/api/references/vscode-api)

### 6.2 Critical placement requirement

Official API has `window.tabGroups` for the main editor grid (`TabGroup`/`Tab`), while terminal location has only Panel or Editor. `TabInputTerminal` identifies a terminal tab but does not provide a placement/container API. No documented API lets an extension create a **second additional tab strip above/beside default editor tabs** or insert arbitrary tabs into a separate Workbench chrome region. This conclusion is an API-surface inference from the official type list; it should be treated as high-confidence for current API, but not as a statement that VS Code internals could never implement it. [VS Code API — TabGroups](https://code.visualstudio.com/api/references/vscode-api#TabGroups), [TabInputTerminal](https://code.visualstudio.com/api/references/vscode-api#TabInputTerminal)

| UX option | Feasibility | Trade-off |
|---|---|---|
| Each Herdr pane as VS Code terminal Panel tab | Supported | Uses default terminal tab strip; cannot appear above editor tabs; focus/mouse semantics are native-ish |
| Each Herdr pane as terminal in Editor location | Supported | Uses default editor tab strip; terminal is not a second strip; multiple tabs consume editor area |
| One WebviewPanel per Space with own top tab row | Supported | Exact visual layout can be drawn; must implement xterm.js/ANSI bridge and own focus/scroll; webview hidden lifecycle can destroy state unless serialized or `retainContextWhenHidden` (memory cost). [Webview API](https://code.visualstudio.com/api/extension-guides/webview) |
| One WebviewPanel with own Spaces + terminal tabs | Supported and simplest custom UX | One terminal renderer/model manager; own accessibility, keyboard, mouse, clipboard and persistence |
| TreeView Agents/Spaces + one active terminal | Supported/recommended v1 | Native tree and commands; only one interactive terminal surface at once |
| External Ghostty/Herdr attach | Supported by OS/CLI, not a VS Code tab strip | Best native terminal behavior; cross-platform launch/discovery is extension-specific |

**Recommendation:** do not block architecture on the impossible extra strip. Make the Herdr model native in TreeView and offer one `Open terminal` action. If visual tabs are essential, use one WebviewPanel with a custom tab row; if native terminal behavior is essential, use VS Code terminal/editor or external `terminal session control`/Ghostty.

### 6.3 Extension host and Node

Desktop local extension host is Node.js and can use `node:net`; remote extension host is Node in remote environment; browser extension host cannot use Node IPC. [Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host), [Node net](https://nodejs.org/api/net.html#ipc-support)

For CLI fallback, Node `child_process.spawn` is the correct non-shell process boundary; avoid interpolating untrusted IDs into shell strings. [Node child_process](https://nodejs.org/api/child_process.html)

## 7. Integration variants and recommendation

### A. Direct JSON Socket API

**Shape:** Node extension host connects to resolved Herdr socket; sends `ping`, then event subscribe + snapshot; caches records; uses methods for operations.

**Pros:** no terminal scraping; low latency; one persistent connection for events; exact IDs/revisions; no additional server.
**Cons:** socket discovery/session selection; no full terminal stream; API error catalog is open string; protocol method availability/version skew; extension gains powerful local control.
**Stability:** best state/control boundary for current 0.9.0, but pin schema and feature-detect.
**Verdict:** **primary architecture for Phase 1.**

### B. CLI as subprocess

**Shape:** `spawn(HERDR_BIN_PATH, ['workspace','list', ...])`, parse JSON/exit status/stderr.

**Pros:** official portable wrappers; `HERDR_BIN_PATH` handles install path and Windows named-pipe abstraction; easy debugging; no raw wire implementation.
**Cons:** per-command process overhead; no efficient long-lived event stream; output shape/JSON flags vary; process cancellation and quoting; polling can lose events.
**Stability:** strongest portability, weakest interactive/state-stream UX.
**Verdict:** use for discovery, one-shot operations and fallback; not the state engine.

### C. `terminal session control`/`agent attach` wrapper

**Shape:** spawn official controller, decode `terminal.frame`, feed xterm.js, send controller commands from PTY UI.

**Pros:** documented third-party bridge; real Herdr-rendered ANSI frames; input/resize/scroll/ownership already implemented; no independent PTY.
**Cons:** controller is a child process; reconnect must restart controller and restore dimensions; CLI NDJSON is a coupling point; Linux/macOS direct attach limit; xterm.js/webview still has browser focus/mouse/clipboard concerns.
**Stability:** better than private binary, less structured than JSON API.
**Verdict:** **primary terminal PoC.**

### D. Separate upstream streaming API

Ask upstream for a stable endpoint/library that combines: snapshot/bootstrap, rendered terminal frame stream, input, resize, scroll, read-only observer, single controller/takeover, explicit capabilities and reconnect semantics. This would remove CLI subprocess coupling and allow a proper xterm.js client. It is not available as a separate JSON API in installed schema today.
**Verdict:** pursue only after PoC demonstrates measurable gaps.

### E. Thin adapter/broker

Own a small local process with extension-facing protocol (`session state`, `terminal stream`, `lease`, reconnect) and translate to Herdr JSON/controller.
**Pros:** centralizes reconnect/version policy; lets multiple VS Code windows share a stable local contract; future backend swap.
**Cons:** another daemon and socket; installation/lifecycle/security; duplicate state/cache; does not eliminate internal Herdr coupling.
**Verdict:** fallback after direct-client PoC, not default.

## 8. PRD requirements ↔ Herdr status

| PRD requirement | Status | Evidence/qualification |
|---|---|---|
| Persistent server-owned session | **Already available** | Detach semantics, background server/PTY. [Concepts](https://herdr.dev/docs/concepts/) |
| VS Code + Ghostty same live process | **Available with adapter** | Herdr direct attach/controller; VS Code needs CLI stream bridge or external terminal. |
| Reconnect after extension restart | **Available with adapter** | Subscribe/snapshot bootstrap and controller restart; extension must implement. |
| Survive Herdr server restart with arbitrary process | **Missing/unsupported** | Docs explicitly say processes do not survive restart; only layout/native restore. [Session state](https://herdr.dev/docs/session-state/) |
| Native agent conversation restore | **Already available for supported integrations** | Requires current integration/session refs and config. |
| Workspace/Space tree | **Already available + VS Code adapter** | Workspace/tab/pane records and event stream. |
| Worktree grouping | **Already available** | `worktree.*`, provenance, group close rules. |
| Agent status/detection | **Already available** | Herdr authority model and schema states. |
| Agent prompt/wait/read/input | **Already available** | JSON methods/CLI automation. |
| Continuous ANSI screen stream from JSON socket | **Unknown / likely unsupported** | No terminal stream method in JSON schema; use controller CLI. |
| Full TUI interaction embedded in integrated terminal | **Available but UX-risky** | Pseudoterminal/attach can work; PRD already reports focus/mouse/clipboard issues. |
| VS Code custom terminal with Herdr PTY | **Available with adapter** | Pseudoterminal + controller child process. |
| Separate additional VS Code tab strip | **Unsupported by official API** | Use webview own strip or native terminal/editor alternatives. |
| Notifications in Herdr and VS Code | **Already available separately** | Herdr notification API; VS Code message APIs. |
| Focus-driven automatic input handoff | **Unknown** | Schema surface lease and direct controller takeover exist; cross-app focus policy is not supplied. |
| Multi-client read-only observers | **Already available for terminal controller** | `observe` allows multiple; JSON state clients need own cache rules. |
| Remote Herdr via SSH | **Already available** | Host/platform/auth constraints apply. |
| Replacing Herdr with a new persistence daemon | **Not needed** | Contradicts reuse-before-rebuild; only add broker for proven stream gap. |

## 9. Phased architecture and smallest PoC

### Recommended architecture

```text
VS Code extension (Node host)
  ├─ HerdrConnector: socket discovery, ping/schema, request IDs, reconnect
  ├─ StateStore: snapshot + buffered events + revision-aware cache
  ├─ Commands: workspace/tab/pane/agent/worktree actions
  ├─ Agents/Spaces TreeView
  └─ TerminalSurface (optional)
       └─ child_process: herdr terminal session control
            └─ xterm.js in WebviewPanel OR VS Code Pseudoterminal

Herdr server
  └─ server-owned workspaces/tabs/panes/PTYs/agents
```

### Phases

1. **Phase 0 — protocol probe (read-only):** `ping`; verify protocol 22/endpoint generation; connect to known socket; subscribe lifecycle events; snapshot; render state in extension output/tree; reconnect and fresh snapshot.
2. **Phase 1 — native state client:** TreeView Spaces→Tabs→Panes→Agents; focus/open/read; commands for workspace/tab/pane/agent actions; no full terminal renderer yet.
3. **Phase 2 — terminal PoC:** in a disposable named session/pane, launch `terminal session observe`; decode frames to xterm.js; then `control` with input/resize/release and explicit takeover; test switching to Ghostty.
4. **Phase 3 — usable UX:** choose native VS Code terminal/editor versus one custom WebviewPanel; add active controller state and explicit `Take control`; keep observer read-only by default.
5. **Phase 4 — hardening:** protocol/schema compatibility, remote extension host, multiple windows, reconnect/backoff, logs, security disclosure, version matrix.
6. **Phase 5 — upstream proposal (only if needed):** request supported streaming API/client library based on measured wrapper pain.

### Smallest useful PoC

A minimal proof should do only this:

1. Extension command `Herdr: Connect` discovers configured/default socket.
2. `ping` validates `protocol=22` and logs capabilities.
3. Separate subscription connection sends `events.subscribe` for workspace/tab/pane/agent/layout events.
4. Snapshot connection calls `session.snapshot`; install cache after applying buffered events.
5. TreeView displays workspaces → tabs → panes with `agent_status` and `revision`.
6. Tree item command calls `pane.read` or `agent.get`; no mutation needed initially.
7. Disconnect/reconnect test proves fresh snapshot and no duplicate/stale tree.
8. Only then attach one test pane through `terminal session observe`; do not start a second independent agent.

## 10. Risks and open experiments

| Risk | Severity | Mitigation/experiment |
|---|---|---|
| Herdr server restart kills arbitrary agent/process | High | UI labels live vs restored; rely on native agent restore only where reported; never promise PID continuity |
| JSON API has no live terminal stream | High | controller PoC; upstream API request if unacceptable |
| Controller CLI contract/version skew | High | pin supported Herdr version range; parse only documented NDJSON; verify `terminal.closed`; run `ping`/schema at startup |
| Controller ownership conflict | High | observer by default; explicit `Take control`/`--takeover`; display controller state; test simultaneous Ghostty + VS Code |
| Input/focus/mouse/clipboard loss in webview | High | native Pseudoterminal and xterm.js tests; fallback to external Herdr/Ghostty |
| VS Code cannot create extra tab strip | High | choose one WebviewPanel custom row or native editor/terminal group; do not promise placement |
| Event gap/cache corruption | High | subscribe-before-snapshot; fresh snapshot on every reconnect; revision-aware reads |
| Socket discovery/session mismatch | High | use `HERDR_SOCKET_PATH`/`HERDR_SESSION`; show selected session; never silently target focused pane from another client |
| Protocol/schema version skew | High | `ping`; generated types from `herdr api schema --json`; ignore unknown fields; disable missing feature only |
| Local IPC privilege/security | High | socket file permissions; extension is effectively trusted local session controller; no network exposure |
| Remote VS Code host mismatch | Medium | detect `vscode.env.remoteName`; connect in host where Herdr runs; mark web unsupported |
| Agent detection false blocked/idle | Medium | display `unknown`; use `agent.explain`; do not auto-send approval input |
| Screen history leaks credentials | High | do not enable pane history automatically; document secrets risk |
| Herdr updates/integration versions | Medium | `integration status`; test native session refs and handoff separately |
| Plugin code trust | High | do not install/link plugin automatically; plugins run as user without sandbox. [Plugins](https://herdr.dev/docs/plugins/) |

### Concrete non-destructive experiments

1. **Socket bootstrap:** `herdr status`; `herdr api snapshot`; a Node script with two connections (`events.subscribe` first, `session.snapshot` second), inject artificial event buffer, verify ordering and reconnect behavior. Do not call `server.stop`.
2. **Schema compatibility:** run `herdr api schema --json` into a versioned temporary file, compare method names/required fields to generated TypeScript types; test unknown response fields and unknown method error handling.
3. **Read-only stream:** choose an existing safe pane and run `herdr terminal session observe <pane-id> --cols 120 --rows 40`; decode several `terminal.frame` records and confirm `terminal.closed` on clean release/exit. Do not use `--takeover`.
4. **Controller:** in a disposable named test session, start a harmless shell pane, run `terminal session control ...`; send only `terminal.resize`, `terminal.input` with `printf`, then `terminal.release`; verify a second controller is rejected and explicit takeover is visible.
5. **xterm bridge:** Webview/xterm.js receives decoded ANSI; compare alternate-screen, resize, Ctrl-C, bracketed paste, mouse, OSC title, Unicode, and scroll with native Herdr terminal.
6. **VS Code placement:** create one `ExtensionTerminalOptions` terminal at `Panel`, one at `Editor`/`viewColumn`, and one split; record actual tab locations. This is a confirmation experiment, not a route to a second strip.
7. **Focus policy:** observe `vscode.window.onDidChangeWindowState` and `onDidChangeActiveTerminal`; compare with explicit controller `release`/takeover. Do not auto-takeover until semantics are agreed.
8. **Workspace association:** open multiple VS Code folders and map `workspaceFolder.uri.fsPath` to Herdr workspace `cwd`/worktree provenance; test ambiguous same-cwd workspaces without mutating Herdr layout.
9. **Restart semantics:** only in a disposable named Herdr session, record `session.snapshot`, stop/restart through an explicitly approved test flow, and verify layout vs process/native-agent restore separately. Never use the user’s default session.

## 11. Vendoring docs and knowledge strategy

**Не копировать набор Herdr docs в repository.** Current docs are living web content and can change independently of installed 0.9.0; copied pages quickly become stale and create attribution/update burden. Keep this single report with:

- research date and exact installed version;
- local schema path/field references;
- canonical first-party URLs;
- explicit version-skew notes;
- a small generated protocol adapter/type layer, if implementation starts.

Official Herdr source repository is public and tagged source is available: [herdrdev/herdr v0.9.0](https://github.com/herdrdev/herdr/tree/v0.9.0). Its `LICENSE` grants Apache License 2.0 rights including reproduction/derivative works subject to license/notice/modified-file conditions. [LICENSE](https://raw.githubusercontent.com/herdrdev/herdr/v0.9.0/LICENSE) This makes source/schema reuse legally feasible, but does not by itself establish a separate license for copying website prose. If a reproducible contract is needed, prefer checking in the generated schema (with Apache LICENSE/NOTICE attribution and pinned version) rather than vendoring docs; otherwise generate/read schema from the installed binary at runtime.

Do not copy `skills/herdr/SKILL.md` as product documentation. It is an agent-operation skill, not the extension protocol contract. Its canonical version is available from the official source/tag. [Agent skill](https://herdr.dev/docs/agent-skill/)

## 12. Source inventory (accessed 2026-09-15)

### Kept primary sources

- `/tmp/herdr-0.9.0-cli.txt` — installed Herdr 0.9.0 CLI group snapshot and `herdr status`: exact local command surface, protocol 22, endpoint generation 1 and socket path.
- `/tmp/herdr-0.9.0-api-schema.json` — installed CLI-exported JSON Schema: protocol/schema version, request `oneOf` method inventory, params, event envelopes, subscription events, success/error response shapes.
- [Herdr Socket API](https://herdr.dev/docs/socket-api/) — wire format, discovery, bootstrap, methods, events, plugins, compatibility and error examples.
- [Herdr Session state and restore](https://herdr.dev/docs/session-state/) — detach/restart/history/native restore/live handoff matrix.
- [Herdr Persistence and remote access](https://herdr.dev/docs/persistence-remote/) — named sessions, SSH, direct attach, observe/control stream and ownership.
- [Herdr Concepts](https://herdr.dev/docs/concepts/) — server/client/workspace/tab/pane model.
- [Herdr Agents](https://herdr.dev/docs/agents/) — detection, states, direct agent attach.
- [Herdr Integrations](https://herdr.dev/docs/integrations/) — lifecycle/session identity integration roles.
- [Herdr Agent automation](https://herdr.dev/docs/agent-automation/) — CLI automation and wait/prompt semantics.
- [Herdr Connecting machines](https://herdr.dev/docs/connecting-machines/) — saved SSH machine lifecycle and security.
- [Herdr Configuration](https://herdr.dev/docs/configuration/) and [Config reference](https://herdr.dev/docs/config-reference/) — config, keybindings, pane defaults, notifications, layouts.
- [Herdr Plugins](https://herdr.dev/docs/plugins/) — manifest hooks/actions/panes, trust and storage.
- [Herdr official source v0.9.0](https://github.com/herdrdev/herdr/tree/v0.9.0) and [API source](https://raw.githubusercontent.com/herdrdev/herdr/v0.9.0/src/api/schema.rs) — public implementation/source cross-check; [Apache LICENSE](https://raw.githubusercontent.com/herdrdev/herdr/v0.9.0/LICENSE).
- [VS Code API](https://code.visualstudio.com/api/references/vscode-api) — official extension API types/functions including terminal, Pseudoterminal, tabs, webviews and commands.
- [VS Code Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host) — local/remote Node and browser host boundaries.
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview), [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors), [Contribution Points](https://code.visualstudio.com/api/references/contribution-points) — custom UX surfaces and lifecycle.
- [Node.js `net` IPC](https://nodejs.org/api/net.html#ipc-support) and [child_process](https://nodejs.org/api/child_process.html) — Unix socket/named pipe and subprocess primitives.

### Deprioritized/rejected

- Third-party reviews, blogs and benchmarks — excluded by task scope.
- Search-result summaries — used only to locate first-party pages; claims above cite fetched official pages or local artifacts.
- Current web docs as sole evidence for 0.9.0 wire details — current pages may contain newer behavior; local CLI/schema wins.

## Итоговая рекомендация

Начать с **direct JSON client для state/control + CLI `terminal session control` как отдельного экспериментального terminal surface**, без нового broker и без попытки встроить Herdr TUI в VS Code integrated terminal. В UI сначала реализовать native Agents/Spaces TreeView и explicit `Open/Take control/Release` commands. Full visual terminal tabs реализовывать только как один WebviewPanel с собственной строкой tabs либо отказаться от точного требования в пользу VS Code editor/Pseudoterminal/native external terminal. Автоматический focus handoff, server restart guarantees и upstream streaming API оставить за экспериментами.
