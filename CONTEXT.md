# VS Code Herdr Extension

A VS Code client for navigating and interacting with sessions and terminals owned by Herdr.

## Language

### Session and navigation

**Herdr Session**:
An isolated Herdr runtime namespace with its own socket, Spaces, Panes, processes, and agents. The extension has one active Herdr Session whose state is projected into its navigation Views.
_Avoid_: agent session, conversation, Space

**Stale**:
A Herdr Session state where the last known Spaces and Panes stay visible but no server-changing action is allowed until the Session reconnects.
_Avoid_: offline, cached, disconnected (for the projected state)

**Space**:
The user-facing Herdr grouping shown under “spaces”; it corresponds exactly to a Herdr Workspace (`workspace_id`) and is not an extension-owned grouping.
_Avoid_: VS Code workspace, project, workspace group

**Selected Space**:
The Space this VS Code window is browsing; a local choice that never changes Herdr focus.
_Avoid_: active Space, current Space

**Herdr Tab**:
A layout group inside a Space containing one or more Panes, potentially arranged as splits.
_Avoid_: terminal, VS Code editor tab

**Pane**:
A server-owned Herdr terminal surface; its process keeps running regardless of which clients show it.
_Avoid_: Herdr Tab, editor group

**Focused Pane**:
The Pane Herdr considers focused server-wide; VS Code reads it and leaves setting it to Herdr clients.
_Avoid_: active Pane, selected Pane

### Pane Editors and control

**Pane Editor**:
A VS Code terminal tab that shows one Pane. Closing it releases only the extension's clients; the Pane keeps running in Herdr.
_Avoid_: Pane tab, terminal

**Attach**:
A Pane Editor's exclusive interactive connection to a Pane; it owns input and the Pane's geometry until it disconnects. Once lost to another client, it is regained only by fresh local input or focus.
_Avoid_: control, take control, connect

**Observe**:
A read-only live view of a Pane, shown while the Pane Editor is visible but does not hold the Attach.
_Avoid_: preview, mirror

**Yield**:
VS Code voluntarily releasing its Attach at the request of another Herdr client.
_Avoid_: release, detach, handoff

**Takeover Popup**:
A Herdr plugin popup shown to other Herdr clients while VS Code holds the Attach on the Focused Pane; any input in it makes VS Code Yield.
_Avoid_: mobile popup, takeover dialog
