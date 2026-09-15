# VS Code Herdr Extension

A VS Code client for navigating and interacting with sessions and terminals owned by Herdr.

## Language

**Herdr Session**:
An isolated Herdr runtime namespace with its own socket, Spaces, Panes, processes, and agents. The extension has one active Herdr Session whose state is projected into its navigation Views.
_Avoid_: agent session, conversation, Space

**Space**:
The user-facing Herdr grouping shown under “spaces”; it corresponds exactly to a Herdr Workspace (`workspace_id`) and is not an extension-owned grouping.
_Avoid_: VS Code workspace, project, workspace group

**Herdr Tab**:
A layout group inside a Space containing one or more Panes, potentially arranged as splits.
_Avoid_: terminal, VS Code editor tab

**Pane**:
A server-owned Herdr terminal surface and the default unit opened by the extension as a native VS Code terminal editor tab.
_Avoid_: Herdr Tab, editor group
