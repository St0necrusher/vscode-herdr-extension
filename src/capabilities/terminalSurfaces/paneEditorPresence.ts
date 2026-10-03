export type PaneEditorReference = Readonly<{ sessionId: string; paneId: string }>;

// `focused` is always one of `visible`: the Visible Pane Editor that is the active tab of the active editor group.
export type PaneEditorPresence = Readonly<{
  visible: readonly PaneEditorReference[];
  focused?: PaneEditorReference;
}>;

export interface PaneEditorPresenceSource {
  getPaneEditorPresence(): PaneEditorPresence;
  onDidChangePaneEditorPresence(listener: (presence: PaneEditorPresence) => void): { dispose(): void };
}
