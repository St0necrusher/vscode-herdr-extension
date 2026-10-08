import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { Logger } from "@core/logger";
import type { ActiveSessionProjectionState } from "../../src/modules/sessions/activeSessionProjection";
import type {
  ActiveSessionProjectionSource,
  HerdrSessionEventSource,
} from "../../src/modules/pane-editors/session-source";
import type { HerdrPane, HerdrPaneMovedEvent, HerdrSessionSnapshot } from "../../src/api/herdr/shared/types";
import type { PaneTerminalOpenRequest } from "../../src/modules/pane-editors";
import type { PaneAttach } from "../../src/api/herdr/pane-clients/HerdrPaneAttach";
import type { PaneClientFactory } from "../../src/api/herdr/pane-clients/HerdrPaneClientFactory";
import type { PaneObserver } from "../../src/api/herdr/pane-clients/HerdrPaneObserver";
import {
  PaneEditorFocusTracker,
  PaneEditorSelectionModel,
  PaneTerminalSurfaceManager,
  VsCodePaneTerminalSurface,
} from "../../src/modules/pane-editors";

interface ClientRecord {
  request: Parameters<PaneClientFactory["createAttach"]>[0];
  kind: "observer" | "attach";
  stopped: boolean;
}

class FakePaneClientFactory implements PaneClientFactory {
  readonly clients: ClientRecord[] = [];

  createObserver(request: Parameters<PaneClientFactory["createObserver"]>[0]): PaneObserver {
    const client = this.createClient("observer", request);
    return { completion: client.completion, stop: () => client.stop() };
  }

  createAttach(request: Parameters<PaneClientFactory["createAttach"]>[0]): PaneAttach {
    const client = this.createClient("attach", request);
    return {
      completion: client.completion,
      sendInput: () => undefined,
      resize: () => undefined,
      stop: () => client.stop(),
    };
  }

  private createClient(
    kind: ClientRecord["kind"],
    request: ClientRecord["request"],
  ): { completion: Promise<void>; stop(): Promise<void> } {
    const record: ClientRecord = { kind, request, stopped: false };
    this.clients.push(record);

    let resolveCompletion!: () => void;
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    let stopPromise: Promise<void> | undefined;
    const stop = (): Promise<void> => {
      if (stopPromise === undefined) {
        record.stopped = true;
        resolveCompletion();
        stopPromise = Promise.resolve();
      }
      return stopPromise;
    };

    return { completion, stop };
  }
}

class FakeSessionEvents implements HerdrSessionEventSource {
  private readonly listeners = new Set<(event: HerdrPaneMovedEvent) => void>();

  subscribe(_eventName: "pane.moved", listener: (event: HerdrPaneMovedEvent) => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  emit(event: HerdrPaneMovedEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}

interface PaneEditorHarness {
  readonly events: FakeSessionEvents;
  readonly pane: HerdrPane;
  readonly manager: PaneTerminalSurfaceManager;
  readonly clients: FakePaneClientFactory;
  readonly request: PaneTerminalOpenRequest;
  readonly expectedTabLabel: string;
  readonly initialTerminals: ReadonlySet<vscode.Terminal>;
  readonly closedTerminals: ReadonlySet<vscode.Terminal>;
}

let sequence = 0;
const logger: Logger = { info: () => undefined, error: () => undefined, show: () => undefined };
suite("Pane editors in VS Code", () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension, "Extension is installed in the test host");
    await extension.activate();
  });

  test("pane.moved reroutes the open editor and updates its title without replacing its terminal", async () => {
    await withPaneEditorHarness(async (harness) => {
      harness.manager.openPane(harness.request);
      await waitForPaneTab(harness.expectedTabLabel);
      await waitForPaneClient(harness.clients, "before Pane move");
      const terminal = onlyCreatedTerminal(harness);
      const currentPane = {
        ...harness.pane,
        id: "moved-pane",
        terminalId: "moved-terminal",
        spaceId: "moved-space",
        herdrTabId: "moved-tab",
        terminalTitle: "Moved Pane",
      };
      harness.events.emit({
        sessionId: harness.request.sessionId,
        previousPaneId: harness.request.paneId,
        currentPane,
      });
      await waitForPaneTab("Moved\u00a0Pane");
      await waitFor(
        () => runningClients(harness.clients).some((client) => client.request.terminalId === "moved-terminal"),
        "the moved terminal routing",
      );
      assert.strictEqual(onlyCreatedTerminal(harness), terminal);
      assert.deepEqual(harness.manager.getPaneEditorPresence().focused, {
        sessionId: harness.request.sessionId,
        paneId: "moved-pane",
      });
      harness.manager.openPane({ ...harness.request, paneId: currentPane.id, terminalId: currentPane.terminalId });
      assert.equal(createdTerminals(harness).length, 1);
      harness.manager.closePanes(harness.request.sessionId, [currentPane.id]);
      await waitFor(() => runningClients(harness.clients).length === 0, "the rerouted client to close");
    });
  });

  test("C7 opens, binds, hides, and reveals one Pane editor", async () => {
    await withPaneEditorHarness(async (harness) => {
      const initialGroup = vscode.window.tabGroups.activeTabGroup;
      harness.manager.openPane(harness.request);

      const firstTab = await waitForPaneTab(harness.expectedTabLabel, (located) => located.group === initialGroup);
      assert.equal(firstTab.tab.label, harness.expectedTabLabel);
      assert.strictEqual(initialGroup.activeTab, firstTab.tab);
      assert.equal(paneTabs(harness.expectedTabLabel).length, 1);
      assert.equal(createdTerminals(harness).length, 1);
      const terminal = onlyCreatedTerminal(harness);
      await waitForPaneClient(harness.clients, "C7 initial Pane tab");

      const initialClientCount = harness.clients.clients.length;
      harness.manager.openPane(harness.request);
      assert.equal(
        createdTerminals(harness).length,
        1,
        "opening the active Pane again does not create another terminal",
      );
      assert.equal(
        harness.clients.clients.length,
        initialClientCount,
        "opening the active Pane again does not restart its client",
      );

      const document = await vscode.workspace.openTextDocument({
        language: "plaintext",
        content: "hide the Pane editor",
      });
      await vscode.window.showTextDocument(document, initialGroup.viewColumn);
      await waitFor(() => initialGroup.activeTab !== firstTab.tab, "the Pane tab to become hidden");
      await waitFor(() => runningClients(harness.clients).length === 0, "a hidden Pane tab runs no client");

      harness.manager.openPane(harness.request);
      const revealedTab = await waitForPaneTab(harness.expectedTabLabel, (located) => located.group === initialGroup);
      await waitFor(() => isActiveTab(revealedTab.tab), "the existing Pane tab to be revealed");
      await waitForPaneClient(harness.clients, "C7 revealed Pane tab");
      assert.equal(createdTerminals(harness).length, 1, "revealing the Pane reuses its terminal");
      assert.strictEqual(onlyCreatedTerminal(harness), terminal);
      assert.equal(paneTabs(harness.expectedTabLabel).length, 1);
    });
  });

  test("C8 keeps the same Pane terminal alive and rebinds its title after moving groups", async () => {
    await withPaneEditorHarness(async (harness) => {
      harness.manager.openPane(harness.request);
      const original = await waitForPaneTab(harness.expectedTabLabel);
      const terminal = onlyCreatedTerminal(harness);
      await waitForPaneClient(harness.clients, "C8 initial Pane tab");

      const document = await vscode.workspace.openTextDocument({
        language: "plaintext",
        content: "second editor group",
      });
      await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
      await waitFor(
        () => vscode.window.tabGroups.all.some((group) => group !== original.group),
        "a second editor group",
      );
      await vscode.commands.executeCommand("workbench.action.focusPreviousGroup");
      await waitFor(
        () => vscode.window.tabGroups.activeTabGroup === original.group,
        "the Pane's original group to be active",
      );
      assert.strictEqual(original.group.activeTab, original.tab, "the Pane tab is active before moving it");

      await vscode.commands.executeCommand("workbench.action.moveEditorToRightGroup");
      const moved = await waitForPaneTab(harness.expectedTabLabel, (located) => located.group !== original.group);
      await waitForPaneClient(harness.clients, "C8 moved Pane tab");
      // Rebinding briefly publishes the terminal name before the Pane title returns.
      await waitFor(() => moved.tab.label === harness.expectedTabLabel, "the moved tab to show the Pane title again");
      assert.equal(paneTabs(harness.expectedTabLabel).length, 1);
      assert.ok(vscode.window.terminals.includes(terminal), "the original VS Code terminal remains open");
      assert.equal(createdTerminals(harness).length, 1, "moving the tab does not create another terminal");
      assert.equal(harness.closedTerminals.has(terminal), false, "moving the tab does not close its terminal");
    });
  });

  test("C9 closing a Pane terminal stops its client and a later open creates a fresh terminal", async () => {
    await withPaneEditorHarness(async (harness) => {
      harness.manager.openPane(harness.request);
      await waitForPaneTab(harness.expectedTabLabel);
      const closedTerminal = onlyCreatedTerminal(harness);
      await waitForPaneClient(harness.clients, "C9 initial Pane tab");

      closedTerminal.dispose();
      await waitFor(() => harness.closedTerminals.has(closedTerminal), "the Pane terminal to close");
      await waitFor(() => runningClients(harness.clients).length === 0, "the closed Pane client to stop");
      await waitFor(() => paneTabs(harness.expectedTabLabel).length === 0, "the closed Pane editor tab to disappear");

      harness.manager.openPane(harness.request);
      await waitForPaneTab(harness.expectedTabLabel);
      const reopenedTerminal = onlyCreatedTerminal(harness);
      await waitForPaneClient(harness.clients, "C9 reopened Pane tab");
      assert.notStrictEqual(reopenedTerminal, closedTerminal, "opening the closed Pane creates a fresh terminal");
      assert.ok(vscode.window.terminals.includes(reopenedTerminal));
      assert.equal(paneTabs(harness.expectedTabLabel).length, 1);
    });
  });

  test("C10 closing a Pane tab after moving groups lets a later open create a fresh terminal", async () => {
    await withPaneEditorHarness(async (harness) => {
      harness.manager.openPane(harness.request);
      const original = await waitForPaneTab(harness.expectedTabLabel);
      const movedTerminal = onlyCreatedTerminal(harness);
      await waitForPaneClient(harness.clients, "C10 initial Pane tab");

      await vscode.commands.executeCommand("workbench.action.moveEditorToRightGroup");
      const moved = await waitForPaneTab(harness.expectedTabLabel, (located) => located.group !== original.group);
      await waitForPaneClient(harness.clients, "C10 moved Pane tab");

      // VS Code closes a moved terminal with its tab but skips onDidCloseTerminal; only the Pseudoterminal hears it.
      await vscode.window.tabGroups.close(moved.tab);
      await waitFor(() => paneTabs(harness.expectedTabLabel).length === 0, "the moved Pane tab to close");
      await waitFor(() => runningClients(harness.clients).length === 0, "the closed Pane client to stop");

      harness.manager.openPane(harness.request);
      await waitForPaneTab(harness.expectedTabLabel);
      await waitForPaneClient(harness.clients, "C10 reopened Pane tab");
      // Without onDidCloseTerminal, VS Code keeps listing the closed terminal.
      const reopenedTerminals = createdTerminals(harness).filter((terminal) => terminal !== movedTerminal);
      assert.equal(reopenedTerminals.length, 1, "opening the tabless Pane creates a fresh terminal");
      assert.equal(paneTabs(harness.expectedTabLabel).length, 1);
    });
  });
});

async function withPaneEditorHarness(run: (harness: PaneEditorHarness) => Promise<void>): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  const currentSequence = ++sequence;
  const sessionId = `pane-editor-test-session-${currentSequence}`;
  const terminalTitle = `npm run dev ${currentSequence}`;
  const pane: HerdrPane = {
    id: `pane-${currentSequence}`,
    terminalId: `terminal-${currentSequence}`,
    spaceId: "space-test",
    herdrTabId: "tab-test",
    focused: false,
    agentStatus: "idle",
    revision: 1,
    terminalTitle,
    stateLabels: {},
    tokens: {},
  };
  const expectedTabLabel = terminalTitle.replaceAll(" ", "\u00a0");
  const snapshot: HerdrSessionSnapshot = {
    version: "1",
    protocol: 1,
    spaces: [],
    herdrTabs: [],
    panes: [pane],
    layouts: [],
    agents: [],
  };
  const projectionState: ActiveSessionProjectionState = { kind: "connected", sessionId, snapshot };
  const projectionSource: ActiveSessionProjectionSource = {
    getActiveSessionProjection: () => projectionState,
    onDidChangeActiveSessionProjection: () => ({ dispose: () => undefined }),
  };
  const selection = new PaneEditorSelectionModel();
  // Pane clients attach only in a focused window; the OS decides whether the test host window gets focus.
  const focusedWindow = { state: { focused: true }, onDidChangeWindowState: () => ({ dispose: () => undefined }) };
  const focusTracker = new PaneEditorFocusTracker(selection, focusedWindow);
  const clients = new FakePaneClientFactory();
  const closedTerminals = new Set<vscode.Terminal>();
  const terminalCloseSubscription = vscode.window.onDidCloseTerminal((terminal) => closedTerminals.add(terminal));
  const events = new FakeSessionEvents();
  const manager = new PaneTerminalSurfaceManager(selection, events, {
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
  });
  const harness: PaneEditorHarness = {
    events,
    pane,
    manager,
    clients,
    request: { sessionId, paneId: pane.id, terminalId: pane.terminalId, name: terminalTitle },
    expectedTabLabel,
    initialTerminals: new Set(vscode.window.terminals),
    closedTerminals,
  };

  try {
    await run(harness);
  } finally {
    manager.dispose();
    focusTracker.dispose();
    selection.dispose();
    terminalCloseSubscription.dispose();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  }
}

function paneTabs(label: string): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => isPaneTab(tab, label));
}

function locatePaneTab(label: string): { tab: vscode.Tab; group: vscode.TabGroup } | undefined {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs.map((tab) => ({ tab, group })))
    .find(({ tab }) => isPaneTab(tab, label));
}

function isPaneTab(tab: vscode.Tab, label: string): boolean {
  const matchesPaneTab = tab.label === label && tab.input instanceof vscode.TabInputTerminal;
  return matchesPaneTab;
}

async function waitForPaneTab(
  label: string,
  condition: (located: { tab: vscode.Tab; group: vscode.TabGroup }) => boolean = () => true,
): Promise<{ tab: vscode.Tab; group: vscode.TabGroup }> {
  return waitFor(() => {
    const located = locatePaneTab(label);
    const paneTabMatchesCondition = located !== undefined && condition(located);
    return paneTabMatchesCondition ? located : undefined;
  }, `Pane tab "${label}"`);
}

function isActiveTab(tab: vscode.Tab): boolean {
  return vscode.window.tabGroups.all.some((group) => group.activeTab === tab);
}

function createdTerminals(harness: PaneEditorHarness): vscode.Terminal[] {
  return vscode.window.terminals.filter((terminal) => !harness.initialTerminals.has(terminal));
}

function onlyCreatedTerminal(harness: PaneEditorHarness): vscode.Terminal {
  const terminals = createdTerminals(harness);
  assert.equal(terminals.length, 1, "exactly one test Pane terminal is open");
  const [terminal] = terminals;
  assert.ok(terminal);
  return terminal;
}

function runningClients(factory: FakePaneClientFactory): ClientRecord[] {
  return factory.clients.filter((client) => !client.stopped);
}

async function waitForPaneClient(factory: FakePaneClientFactory, description: string): Promise<void> {
  await waitFor(
    () => runningClients(factory).find((client) => client.kind === "attach"),
    `${description} to have a running direct attach`,
  );
}

async function waitFor<T>(probe: () => T | undefined | false, description: string, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = probe();
    if (value) return value;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${description}`);
}
