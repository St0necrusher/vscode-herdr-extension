import type { HerdrSessionSnapshot } from "@api/herdr";

export type UnavailableNavigationContextState = Readonly<{
  kind: "unavailable";
  sessionId?: string;
}>;

export type ConnectedNavigationContextState = Readonly<{
  kind: "connected";
  sessionId: string;
  snapshot: HerdrSessionSnapshot;
  selectedSpaceId?: string;
}>;

export type StaleNavigationContextState = Readonly<{
  kind: "stale";
  sessionId: string;
  reason: "reconnecting" | "incompatible";
  snapshot: HerdrSessionSnapshot;
  selectedSpaceId?: string;
}>;

export type NavigationContextState =
  UnavailableNavigationContextState | ConnectedNavigationContextState | StaleNavigationContextState;

export interface NavigationContextSource {
  getState(): NavigationContextState;
  onDidChange(listener: (state: NavigationContextState) => void): { dispose(): void };
}

export interface SpaceSelectionOperations {
  selectSpace(spaceId: string): void;
}

// Panes of the active Session with a Visible Pane Editor, and the one with the Focused Pane Editor; editors of other
// Sessions never reach Navigation (ADR 0010).
export interface VisiblePaneEditorsSource {
  getVisiblePaneIds(): ReadonlySet<string>;
  onDidChangeVisiblePaneIds(listener: (paneIds: ReadonlySet<string>) => void): { dispose(): void };
  getFocusedEditorPaneId(): string | undefined;
  onDidChangeFocusedEditorPaneId(listener: (paneId: string | undefined) => void): { dispose(): void };
}
