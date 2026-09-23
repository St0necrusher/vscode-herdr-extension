import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { PanesFeature } from "../../src/features/navigation/panes/PanesFeature";
import type { NavigationContextSource, NavigationContextState } from "../../src/features/navigation/capabilities";
import { TerminalSurfacesFeature } from "../../src/features/terminal-surfaces/TerminalSurfacesFeature";
import type {
  ActiveSessionProjectionSource,
  ActiveSessionProjectionState,
  HerdrPane,
  HerdrSessionSnapshot,
} from "../../src/capabilities/sessions";
import type { HerdrLogger } from "../../src/capabilities/runtime";
import type {
  HerdrTerminalObserverAttempt,
  HerdrTerminalObserverEvent,
  HerdrTerminalObserverFactory,
  HerdrTerminalObserverRequest,
  PaneTerminalOpening,
} from "../../src/capabilities/terminalSurfaces";

let sequence = 0;

class MutableNavigationContext implements NavigationContextSource {
  private state: NavigationContextState;
  private readonly listeners = new Set<(state: NavigationContextState) => void>();

  constructor(initial: NavigationContextState) {
    this.state = initial;
  }

  getState(): NavigationContextState {
    return this.state;
  }

  onDidChange(listener: (state: NavigationContextState) => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  setState(state: NavigationContextState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener(state);
  }
}

function pane(id: string, terminalId: string, tabId: string, label: string, spaceId = "space-a"): HerdrPane {
  return {
    id,
    terminalId,
    spaceId,
    herdrTabId: tabId,
    focused: false,
    agentStatus: "idle",
    revision: 1,
    label,
    stateLabels: {},
    tokens: {},
  };
}

function navigationState(
  sessionId: string,
  panes: readonly HerdrPane[],
  freshness: "connected" | "stale" = "connected",
): NavigationContextState {
  const groupedTabs = new Set(
    panes.filter((candidate) => candidate.herdrTabId === "tab-group").map((candidate) => candidate.id),
  );
  const tabs = new Map<string, HerdrSessionSnapshot["herdrTabs"][number]>();
  for (const candidate of panes) {
    tabs.set(candidate.herdrTabId, {
      id: candidate.herdrTabId,
      spaceId: candidate.spaceId,
      number: tabs.size + 1,
      label: candidate.herdrTabId === "tab-group" ? "Grouped Tab" : "Singleton Tab",
      focused: false,
      paneCount: candidate.herdrTabId === "tab-group" ? groupedTabs.size : 1,
      agentStatus: "idle",
    });
  }
  const snapshot: HerdrSessionSnapshot = {
    version: "1",
    protocol: 1,
    spaces: [
      {
        id: "space-a",
        number: 1,
        label: "Space A",
        focused: true,
        paneCount: panes.length,
        tabCount: tabs.size,
        activeHerdrTabId: "tab-group",
        agentStatus: "idle",
        tokens: {},
      },
    ],
    herdrTabs: [...tabs.values()],
    panes,
    layouts: [],
    agents: [],
  };
  return freshness === "connected"
    ? { kind: "connected", sessionId, snapshot, selectedSpaceId: "space-a" }
    : { kind: "stale", sessionId, reason: "reconnecting", snapshot, selectedSpaceId: "space-a" };
}

function testTreeView<T>(): vscode.TreeView<T> {
  const disposable = { dispose: () => undefined };
  return {
    onDidExpandElement: () => disposable,
    onDidCollapseElement: () => disposable,
    dispose: () => undefined,
    message: undefined,
  } as unknown as vscode.TreeView<T>;
}

async function withPanesFeature(
  initial: NavigationContextState,
  run: (
    prefix: string,
    provider: vscode.TreeDataProvider<vscode.TreeItem>,
    context: MutableNavigationContext,
    requests: readonly Readonly<{ sessionId: string; paneId: string; terminalId: string; name: string }>[],
  ) => Promise<void>,
  paneTerminalOpening?: PaneTerminalOpening,
): Promise<void> {
  const originalRegisterCommand = vscode.commands.registerCommand;
  const originalCreateTreeView = vscode.window.createTreeView;
  const prefix = `herdr.test.${++sequence}.`;
  const context = new MutableNavigationContext(initial);
  const requests: { sessionId: string; paneId: string; terminalId: string; name: string }[] = [];
  let provider: vscode.TreeDataProvider<vscode.TreeItem> | undefined;
  let feature: PanesFeature | undefined;
  const mockTreeView = testTreeView<vscode.TreeItem>();

  vscode.commands.registerCommand = (...args: Parameters<typeof originalRegisterCommand>) =>
    originalRegisterCommand(prefix + args[0], args[1], args[2]);
  vscode.window.createTreeView = <T>(viewId: string, options: vscode.TreeViewOptions<T>) => {
    assert.equal(viewId, "herdr.panes");
    provider = options.treeDataProvider as vscode.TreeDataProvider<vscode.TreeItem>;
    return mockTreeView as vscode.TreeView<T>;
  };

  try {
    feature = new PanesFeature(context, {
      openPane: (request) => {
        requests.push(request);
        paneTerminalOpening?.openPane(request);
      },
    });
    assert.ok(provider);
    await run(prefix, provider, context, requests);
  } finally {
    feature?.dispose();
    vscode.commands.registerCommand = originalRegisterCommand;
    vscode.window.createTreeView = originalCreateTreeView;
  }
}

function sessionSnapshot(terminalIds: readonly string[]): HerdrSessionSnapshot {
  const panes = terminalIds.map((terminalId, index) => pane(`pane-${index}`, terminalId, "tab-a", `Pane ${index}`));
  return { version: "1", protocol: 1, spaces: [], herdrTabs: [], panes, layouts: [], agents: [] };
}

class MutableProjection implements ActiveSessionProjectionSource {
  private state: ActiveSessionProjectionState;
  private readonly listeners = new Set<(state: ActiveSessionProjectionState) => void>();

  constructor(initial: ActiveSessionProjectionState) {
    this.state = initial;
  }

  getActiveSessionProjection(): ActiveSessionProjectionState {
    return this.state;
  }

  onDidChangeActiveSessionProjection(listener: (state: ActiveSessionProjectionState) => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  setState(state: ActiveSessionProjectionState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener(state);
  }
}

interface RecordedAttempt extends HerdrTerminalObserverAttempt {
  readonly request: HerdrTerminalObserverRequest;
  disposeCount(): number;
  emit(event: HerdrTerminalObserverEvent): void;
}

class ControlledObserverFactory implements HerdrTerminalObserverFactory {
  readonly attempts: RecordedAttempt[] = [];

  start(request: HerdrTerminalObserverRequest, listener: (event: HerdrTerminalObserverEvent) => void): RecordedAttempt {
    let disposals = 0;
    const attempt: RecordedAttempt = {
      request,
      emit: (event) => listener(event),
      dispose: () => {
        disposals += 1;
      },
      disposeCount: () => disposals,
    };
    this.attempts.push(attempt);
    return attempt;
  }
}

const logger: HerdrLogger = { info: () => undefined, error: () => undefined, show: () => undefined };
const configuration = {
  read: () => ({ executable: "controlled-test-observer", session: "default" }),
  onDidChange: () => ({ dispose: () => undefined }),
};

function terminalTabs(marker: string): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputTerminal && tab.label.startsWith(`Herdr: ${marker}`));
}

async function waitFor(assertion: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!assertion()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}.`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

suite("Issue #14 Pane terminal host behavior", () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("St0necrusher.vscode-herdr-extension");
    assert.ok(extension, "Extension is installed in the test host");
    await extension.activate();
  });

  test("Pane command rereads connected and stale state, ignoring missing Panes and group headings", async () => {
    const grouped = [
      pane("pane-one", "terminal-one", "tab-group", "Pane One"),
      pane("pane-two", "terminal-two", "tab-group", "Pane Two"),
      pane("pane-single", "terminal-single", "tab-single", "Solo Pane"),
    ];
    await withPanesFeature(navigationState("session-current", grouped), async (prefix, provider, context, requests) => {
      const roots = await provider.getChildren();
      assert.ok(roots);
      const heading = roots.find((item) => item.id === "tab-group");
      assert.ok(heading);
      assert.equal(heading.command, undefined);
      const children = await provider.getChildren(heading);
      assert.ok(children);
      const paneRow = children.find((item) => item.id === "herdr.pane.pane-one");
      assert.ok(paneRow);
      const paneCommand = paneRow.command;
      assert.ok(paneCommand);
      assert.equal(paneCommand.command, "herdr.openPane");
      assert.deepEqual(paneCommand.arguments, ["pane-one"]);
      const singletonRow = roots.find((item) => item.id === "herdr.pane.pane-single");
      assert.ok(singletonRow);
      assert.equal(singletonRow.command?.command, "herdr.openPane");

      await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-one");
      assert.deepEqual(requests, [
        { sessionId: "session-current", paneId: "pane-one", terminalId: "terminal-one", name: "Pane One" },
      ]);

      await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-single");
      assert.deepEqual(requests.at(-1), {
        sessionId: "session-current",
        paneId: "pane-single",
        terminalId: "terminal-single",
        name: "Solo Pane",
      });

      context.setState(
        navigationState(
          "session-reconnected",
          [
            pane("pane-one", "terminal-current", "tab-group", "Current Pane Name"),
            pane("pane-two", "terminal-two-current", "tab-group", "Other Pane"),
          ],
          "stale",
        ),
      );
      await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-one");
      assert.deepEqual(requests.at(-1), {
        sessionId: "session-reconnected",
        paneId: "pane-one",
        terminalId: "terminal-current",
        name: "Current Pane Name",
      });

      await vscode.commands.executeCommand(prefix + "herdr.openPane", "tab-group");
      await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-missing");
      expectRequestCount(requests, 3);

      context.setState(navigationState("session-reconnected", []));
      await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-one");
      expectRequestCount(requests, 3);
    });
  });

  test("Pane command opens, focuses and reuses native surfaces per Session/terminal, then detaches without Herdr mutation", async () => {
    const marker = `Issue 14 ${Date.now()} ${++sequence}`;
    const firstName = `${marker} Pane A`;
    const refreshedName = `${marker} Updated Pane A`;
    const secondName = `${marker} Pane B`;
    const projection = new MutableProjection({
      kind: "connected",
      sessionId: "host-session-a",
      snapshot: sessionSnapshot(["same-terminal"]),
    });
    const observerFactory = new ControlledObserverFactory();
    const terminalSurfaces = new TerminalSurfacesFeature({
      sessionProjection: projection,
      observerFactory,
      configuration,
      logger,
    });
    const first = { sessionId: "host-session-a", paneId: "pane-a", terminalId: "same-terminal", name: firstName };
    const refreshed = { ...first, name: refreshedName };
    const second = { sessionId: "host-session-b", paneId: "pane-b", terminalId: "same-terminal", name: secondName };

    try {
      await withPanesFeature(
        navigationState("host-session-a", [pane("pane-a", "same-terminal", "tab-a", firstName)]),
        async (prefix, provider, context, requests) => {
          const rows = await provider.getChildren();
          assert.ok(rows);
          const paneRow = rows.find((item) => item.id === "herdr.pane.pane-a");
          assert.ok(paneRow);
          assert.equal(paneRow.command?.command, "herdr.openPane");

          await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-a");
          assert.deepEqual(requests.at(-1), first);
          await waitFor(
            () => terminalTabs(marker).length === 1 && observerFactory.attempts.length === 1,
            "the Pane command to open a native editor and observer",
          );
          assert.ok(terminalTabs(marker)[0]?.input instanceof vscode.TabInputTerminal);
          assert.equal(vscode.window.activeTerminal?.name, `Herdr: ${firstName}`);

          context.setState(
            navigationState("host-session-a", [pane("pane-a", "same-terminal", "tab-a", refreshedName)]),
          );
          await vscode.commands.executeCommand(prefix + "herdr.openPane", "pane-a");
          assert.deepEqual(requests.at(-1), refreshed);
          await waitFor(
            () => vscode.window.activeTerminal?.name === `Herdr: ${firstName}`,
            "the existing terminal editor to refocus",
          );
          assert.equal(terminalTabs(marker).length, 1);
          assert.equal(observerFactory.attempts.length, 1);

          projection.setState({
            kind: "connected",
            sessionId: second.sessionId,
            snapshot: sessionSnapshot([second.terminalId]),
          });
          context.setState(
            navigationState(second.sessionId, [pane(second.paneId, second.terminalId, "tab-b", secondName)]),
          );
          await vscode.commands.executeCommand(prefix + "herdr.openPane", second.paneId);
          assert.deepEqual(requests.at(-1), second);
          await waitFor(
            () => terminalTabs(marker).length === 2 && observerFactory.attempts.length === 2,
            "a distinct Session surface for the same terminal ID",
          );
          assert.equal(vscode.window.activeTerminal.name, `Herdr: ${secondName}`);

          projection.setState({
            kind: "connected",
            sessionId: first.sessionId,
            snapshot: sessionSnapshot([first.terminalId]),
          });
          context.setState(
            navigationState(first.sessionId, [pane(first.paneId, first.terminalId, "tab-a", refreshedName)]),
          );
          await vscode.commands.executeCommand(prefix + "herdr.openPane", first.paneId);
          await waitFor(
            () => vscode.window.activeTerminal?.name === `Herdr: ${firstName}`,
            "the original terminal editor to focus again",
          );
          const activeTerminal = vscode.window.activeTerminal;
          assert.ok(activeTerminal);
          activeTerminal.sendText("read-only input attempt");
          await new Promise((resolve) => setTimeout(resolve, 100));
          assert.equal(observerFactory.attempts.length, 2);
          assert.deepEqual(
            observerFactory.attempts.map(({ request }) => ({
              executable: request.executable,
              sessionId: request.sessionId,
              terminalId: request.terminalId,
            })),
            [
              {
                executable: "controlled-test-observer",
                sessionId: "host-session-a",
                terminalId: "same-terminal",
              },
              {
                executable: "controlled-test-observer",
                sessionId: "host-session-b",
                terminalId: "same-terminal",
              },
            ],
          );
          assert.ok(observerFactory.attempts.every(({ request }) => request.columns > 0 && request.rows > 0));

          projection.setState({
            kind: "connected",
            sessionId: second.sessionId,
            snapshot: sessionSnapshot([second.terminalId]),
          });
          context.setState(
            navigationState(second.sessionId, [pane(second.paneId, second.terminalId, "tab-b", secondName)]),
          );
          await vscode.commands.executeCommand(prefix + "herdr.openPane", second.paneId);
          await waitFor(
            () => vscode.window.activeTerminal?.name === `Herdr: ${secondName}`,
            "the second editor before detach",
          );
          await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
          await waitFor(
            () => terminalTabs(marker).length === 1 && observerFactory.attempts[1]?.disposeCount() === 1,
            "the closed editor to detach its observer",
          );
          assert.equal(observerFactory.attempts[0]?.disposeCount(), 0);
          assert.equal(observerFactory.attempts.length, 2);
        },
        { openPane: (request) => terminalSurfaces.openPane(request) },
      );
    } finally {
      terminalSurfaces.dispose();
      await waitFor(() => terminalTabs(marker).length === 0, "test terminal editors to be disposed");
    }
  });
});

function expectRequestCount(requests: readonly unknown[], expected: number): void {
  assert.equal(requests.length, expected);
}
