import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { Logger } from "@core/logger";
import type { ActiveSessionProjectionSource } from "../../src/modules/pane-editors/session-source";
import type { HerdrPane } from "../../src/api/herdr/shared/types";
import type { PaneClientFactory } from "../../src/api/herdr/pane-clients/HerdrPaneClientFactory";
import type { PaneOutputSink } from "../../src/api/herdr/pane-clients/PaneOutputSink";
import {
  PaneEditorFocusTracker,
  PaneEditorSelectionModel,
  PaneTerminalSurfaceManager,
  VsCodePaneTerminalSurface,
} from "../../src/modules/pane-editors";

// xterm.js answers each switch-on of focus reporting with whether its textarea holds keyboard focus.
const FOCUS_REPORTING_ON = "\x1b[?1004l\x1b[?1004h";
const FOCUS_IN = "\x1b[I";

class RecordingPaneClientFactory implements PaneClientFactory {
  sink: PaneOutputSink | undefined;
  readonly input: string[] = [];

  createObserver(): never {
    throw new Error("A focused Pane Editor attaches directly");
  }

  createAttach(_request: unknown, sink: PaneOutputSink): ReturnType<PaneClientFactory["createAttach"]> {
    this.sink = sink;
    return {
      completion: new Promise<void>(() => undefined),
      sendInput: (data) => this.input.push(data),
      resize: () => undefined,
      stop: () => Promise.resolve(),
    };
  }
}

// Runs in a window of its own: VS Code creates xterm lazily, so only the window's first terminal shows the bug (#53).
suite("The first Pane Editor of a window", () => {
  test("takes keyboard focus from the Panes View", async () => {
    const pane: HerdrPane = {
      id: "pane-1",
      terminalId: "terminal-1",
      spaceId: "space-test",
      herdrTabId: "tab-test",
      focused: false,
      agentStatus: "idle",
      revision: 1,
      terminalTitle: "first pane",
      stateLabels: {},
      tokens: {},
    };
    const projectionSource: ActiveSessionProjectionSource = {
      getActiveSessionProjection: () => ({
        kind: "connected",
        sessionId: "session-1",
        snapshot: { version: "1", protocol: 1, spaces: [], herdrTabs: [], panes: [pane], layouts: [], agents: [] },
      }),
      onDidChangeActiveSessionProjection: () => ({ dispose: () => undefined }),
    };
    const logger: Logger = { info: () => undefined, error: () => undefined, show: () => undefined };
    const selection = new PaneEditorSelectionModel();
    // Pane clients attach only in a focused window; the OS decides whether the test host window gets focus.
    const focusedWindow = { state: { focused: true }, onDidChangeWindowState: () => ({ dispose: () => undefined }) };
    const focusTracker = new PaneEditorFocusTracker(selection, focusedWindow);
    const clients = new RecordingPaneClientFactory();
    const manager = new PaneTerminalSurfaceManager(
      selection,
      { subscribe: () => ({ dispose: () => undefined }) },
      {
        create: (paneSelection, viewColumn, terminalName) =>
          new VsCodePaneTerminalSurface(
            paneSelection,
            viewColumn,
            terminalName,
            projectionSource,
            focusTracker,
            clients,
            { offer: () => ({ retract: () => undefined }) },
            logger,
          ),
      },
    );

    try {
      assert.equal(vscode.window.terminals.length, 0, "no terminal was created in this window before");
      // A click on a Pane row leaves keyboard focus in the Panes View.
      await vscode.commands.executeCommand("herdr.panes.focus");
      manager.openPane({ sessionId: "session-1", paneId: pane.id, terminalId: pane.terminalId, name: "first pane" });

      await waitFor(() => {
        clients.sink?.append(FOCUS_REPORTING_ON);
        return clients.input.includes(FOCUS_IN) || undefined;
      }, "the Pane Editor to report keyboard focus");
    } finally {
      manager.dispose();
      focusTracker.dispose();
      selection.dispose();
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    }
  });
});

async function waitFor<T>(probe: () => T | undefined, description: string, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = probe();
    if (value !== undefined) return value;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}`);
}
