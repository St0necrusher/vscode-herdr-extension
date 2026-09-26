import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { HerdrLogger } from "../../src/capabilities/runtime";
import type {
  ActiveSessionProjectionSource,
  ActiveSessionProjectionState,
  HerdrPane,
  HerdrSessionEventSource,
  HerdrSessionSnapshot,
} from "../../src/capabilities/sessions";
import type { PaneTerminalOpenRequest } from "../../src/capabilities/terminalSurfaces";
import type { PaneAttach } from "../../src/infrastructure/pane-editors/HerdrPaneAttach";
import type { PaneClientFactory } from "../../src/infrastructure/pane-editors/HerdrPaneClientFactory";
import type { PaneObserver } from "../../src/infrastructure/pane-editors/HerdrPaneObserver";
import {
  PaneEditorFocusTracker,
  PaneEditorSelectionModel,
  PaneTerminalSurfaceManager,
  VsCodePaneTerminalSurface,
} from "../../src/infrastructure/pane-editors";

interface ClientRecord {
  kind: "observer" | "attach";
  stopped: boolean;
}

class FakePaneClientFactory implements PaneClientFactory {
  readonly clients: ClientRecord[] = [];

  createObserver(): PaneObserver {
    const client = this.createClient("observer");
    return { completion: client.completion, stop: () => client.stop() };
  }

  createAttach(): PaneAttach {
    const client = this.createClient("attach");
    return {
      completion: client.completion,
      sendInput: () => undefined,
      resize: () => undefined,
      stop: () => client.stop(),
    };
  }

  private createClient(kind: ClientRecord["kind"]): { completion: Promise<void>; stop(): Promise<void> } {
    const record: ClientRecord = { kind, stopped: false };
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
  subscribe(): { dispose(): void } {
    return { dispose: () => undefined };
  }
}

interface PaneEditorHarness {
  readonly manager: PaneTerminalSurfaceManager;
  readonly clients: FakePaneClientFactory;
  readonly request: PaneTerminalOpenRequest;
  readonly expectedTabLabel: string;
  readonly initialTerminals: ReadonlySet<vscode.Terminal>;
  readonly closedTerminals: ReadonlySet<vscode.Terminal>;
}

let sequence = 0;
const logger: HerdrLogger = { info: () => undefined, error: () => undefined, show: () => undefined };
suite("Pane editors in VS Code", () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension, "Extension is installed in the test host");
    await extension.activate();
    assert.ok(vscode.window.state.focused, "the VS Code test host window is focused");
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

      assert.equal(moved.tab.label, harness.expectedTabLabel, "the moved tab is rebound and shows the Pane title");
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
  const focusTracker = new PaneEditorFocusTracker(selection);
  const clients = new FakePaneClientFactory();
  const closedTerminals = new Set<vscode.Terminal>();
  const terminalCloseSubscription = vscode.window.onDidCloseTerminal((terminal) => closedTerminals.add(terminal));
  const manager = new PaneTerminalSurfaceManager(selection, new FakeSessionEvents(), {
    create: (paneSelection, viewColumn, terminalName) =>
      new VsCodePaneTerminalSurface(
        paneSelection,
        viewColumn,
        terminalName,
        projectionSource,
        focusTracker,
        clients,
        logger,
      ),
  });
  const harness: PaneEditorHarness = {
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
