export { PaneEditorFocusTracker, type FocusChangeEvent, type PaneEditorFocusListener } from "./PaneEditorFocusTracker";
export { TakeoverPluginRegistration, TakeoverPopupHost } from "./takeover";

export {
  PaneEditorSelectionModel,
  type InferPaneEditorSelectionEvent,
  type PaneEditorSelection,
  type PaneEditorSelectionEventMap,
  type PaneEditorSelectionEventName,
  type SelectedPaneEditor,
} from "./PaneEditorSelectionModel";

export { HerdrPaneClientFactory } from "./HerdrPaneClientFactory";
export { PaneTerminalSurfaceManager } from "./PaneTerminalSurfaceManager";
export { VsCodePaneTerminalSurface } from "./PaneTerminalSurface";
export type { PaneTerminalSurface, PaneTerminalSurfaceFactory } from "./PaneTerminalSurface";
