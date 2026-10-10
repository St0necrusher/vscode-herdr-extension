import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { waitForEditorGroups } from "../../src/core/editor-groups";
import { OpenTabFeature } from "../../src/features/open-tab";
import {
  PaneEditorFocusTracker,
  PaneEditorSelectionModel,
  PaneTerminalSurfaceManager,
  VsCodePaneTerminalSurface,
  paneTerminalOpenRequest,
} from "../../src/modules/pane-editors";
import { NavigationContextModel } from "../../src/modules/workspace-context";
import type { HerdrSessionSnapshot, PaneClientFactory } from "../../src/api/herdr";
import { layoutCases, tab12, tab13, type EditorGroupShape, type LayoutCase } from "./tabLayoutFixtures.test";

interface LayoutHarness {
  openTab(tabId?: string): Promise<void>;
  openPane(paneId: string, column: number): Promise<vscode.Terminal>;
  expectClosed(...terminals: vscode.Terminal[]): void;
}

let sequence = 0;
suite("Tab layout projection", () => {
  layoutCases.forEach((fixture) => {
    test(`${fixture.name}: projects the agreed shape and focuses the Tab's focused Pane`, async () => {
      await withLayout(fixture, async (harness) => {
        await harness.openTab();
        assert.deepEqual(await editorGroupShape(), fixture.shape);
        assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab?.label, fixture.layout.focusedPaneId);
        fixture.layout.panes.forEach(({ paneId }) => {
          const group = orderedGroups().find((candidate) => candidate.activeTab?.label === paneId);
          assert.ok(group, `Pane ${paneId} is active in its cell`);
          assert.deepEqual(
            group.tabs.map((tab) => tab.label),
            [paneId],
          );
        });
      });
    });
  });

  test("turns left/right file groups into top/bottom cells with files behind their Pane Editors", async () => {
    await withLayout(layoutCase("down"), async (harness) => {
      await setGroups(2);
      await openDocument("left.txt", 1);
      await openDocument("right.txt", 2);
      await harness.openTab();
      assert.deepEqual(await editorGroupShape(), { orientation: 1, groups: ["A", "B"] });
      assert.deepEqual(groupTabs(), [
        ["left.txt", "A"],
        ["right.txt", "B"],
      ]);
    });
  });

  test("merges surplus groups into cell four in order without losing a dirty document", async () => {
    await withLayout(layoutCase("live 2x2 probe"), async (harness) => {
      await setGroups(5);
      await openDocument("one.txt", 1);
      await openDocument("two.txt", 2);
      await openDocument("three.txt", 3);
      await openDocument("four.txt", 4);
      const document = await openDocument("five.txt", 5);
      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, new vscode.Position(0, 0), "unsaved contents");
      assert.equal(await vscode.workspace.applyEdit(edit), true);
      assert.equal(document.isDirty, true);
      await harness.openTab();
      assert.deepEqual(await editorGroupShape(), layoutCase("live 2x2 probe").shape);
      assert.deepEqual(groupTabs(), [
        ["one.txt", "p5Y"],
        ["two.txt", "p61"],
        ["three.txt", "p5Z"],
        ["four.txt", "five.txt", "p50"],
      ]);
      assert.equal(document.getText(), "unsaved contents");
      assert.equal(document.isDirty, true);
      const dirtyTab = orderedGroups()[3]?.tabs.find((tab) => tab.label === "five.txt");
      assert.ok(dirtyTab);
      assert.equal(dirtyTab.isDirty, true);
    });
  });

  test("creates trailing cells containing only their Pane Editors when two groups become four", async () => {
    await withLayout(layoutCase("live 2x2 probe"), async (harness) => {
      await setGroups(2);
      await openDocument("left.txt", 1);
      await openDocument("right.txt", 2);
      await harness.openTab();
      assert.deepEqual(await editorGroupShape(), layoutCase("live 2x2 probe").shape);
      assert.deepEqual(groupTabs(), [["left.txt", "p5Y"], ["right.txt", "p61"], ["p5Z"], ["p50"]]);
    });
  });

  test("recreates a lone misplaced Pane Editor in its assigned cell", async () => {
    await withLayout(layoutCase("right with down on second"), async (harness) => {
      const terminal = await harness.openPane("C", 1);
      harness.expectClosed(terminal);
      await harness.openTab();
      assert.deepEqual(await editorGroupShape(), {
        orientation: 0,
        groups: ["A", { orientation: 1, groups: ["B", "C"] }],
      });
      assert.deepEqual(groupTabs(), [["A"], ["B"], ["C"]]);
      assert.notStrictEqual(paneTerminal("C"), terminal);
    });
  });

  test("recreates both misplaced Pane Editors in a two-Pane swap", async () => {
    await withLayout(layoutCase("right"), async (harness) => {
      await setGroups(2);
      const b = await harness.openPane("B", 1);
      const a = await harness.openPane("A", 2);
      assert.deepEqual(groupTabs(), [["B"], ["A"]]);
      harness.expectClosed(a, b);
      await harness.openTab();
      assert.deepEqual(await editorGroupShape(), { orientation: 0, groups: ["A", "B"] });
      assert.deepEqual(groupTabs(), [["A"], ["B"]]);
      assert.notStrictEqual(paneTerminal("A"), a);
      assert.notStrictEqual(paneTerminal("B"), b);
    });
  });

  test("recreates disjoint swaps and the Pane displaced by their closing groups while retaining the file", async () => {
    await withLayout(layoutCase("nine Panes"), async (harness) => {
      await setGroups(5);
      const b = await harness.openPane("B", 1);
      const a = await harness.openPane("A", 2);
      const d = await harness.openPane("D", 3);
      const c = await harness.openPane("C", 4);
      await openDocument("keep.txt", 5);
      const e = await harness.openPane("E", 5);
      harness.expectClosed(a, b, c, d, e);
      await harness.openTab();
      assert.deepEqual(await editorGroupShape(), layoutCase("nine Panes").shape);
      assert.deepEqual(groupTabs(), [["keep.txt", "A"], ["B"], ["C"], ["D"], ["E"], ["F"], ["G"], ["H"], ["I"]]);
      assert.notStrictEqual(paneTerminal("A"), a);
      assert.notStrictEqual(paneTerminal("B"), b);
      assert.notStrictEqual(paneTerminal("C"), c);
      assert.notStrictEqual(paneTerminal("D"), d);
      assert.notStrictEqual(paneTerminal("E"), e);
    });
  });

  test("projects literal 2:1 weights within pixel rounding without minimum-size clamping", async () => {
    await withLayout(layoutCase("2:1 split"), async (harness) => {
      await harness.openTab();
      const layout = await vscode.commands.executeCommand<EditorLayout>("vscode.getEditorLayout");
      const first = layout.groups?.[0]?.size;
      const second = layout.groups?.[1]?.size;
      assert.ok(first !== undefined);
      assert.ok(second !== undefined);
      assert.ok(second >= 250, `smaller cell has enough space (${second}px) to avoid minimum-size clamping`);
      assert.ok(Math.abs(first - 2 * second) <= 3, `expected 2:1 within 3px rounding; got ${first}:${second}`);
      assert.deepEqual(groupTabs(), [["A"], ["B"]]);
    });
  });

  test("repeating the Tab action preserves placement and every Pane Editor identity", async () => {
    await withLayout(layoutCase("live 2x2 probe"), async (harness) => {
      await harness.openTab();
      const terminals = [paneTerminal("p5Y"), paneTerminal("p61"), paneTerminal("p5Z"), paneTerminal("p50")];
      await harness.openTab();
      assert.deepEqual(await editorGroupShape(), layoutCase("live 2x2 probe").shape);
      assert.deepEqual(groupTabs(), [["p5Y"], ["p61"], ["p5Z"], ["p50"]]);
      assert.equal(vscode.window.tabGroups.activeTabGroup.viewColumn, vscode.ViewColumn.One);
      assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab?.label, "p5Y");
      [paneTerminal("p5Y"), paneTerminal("p61"), paneTerminal("p5Z"), paneTerminal("p50")].forEach(
        (terminal, index) => {
          assert.strictEqual(terminal, terminals[index]);
        },
      );
    });
  });

  test("recreates a misplaced Pane Editor from inactive cell nine and focuses its retained Pane Editor", async () => {
    await withLayout(layoutCase("nine Panes"), async (harness) => {
      await setGroups(9);
      const i = await harness.openPane("I", 9);
      const a = await harness.openPane("A", 9);
      assert.deepEqual(
        orderedGroups()[8]?.tabs.map((tab) => tab.label),
        ["I", "A"],
      );
      await vscode.commands.executeCommand("workbench.action.focusFirstEditorGroup");
      await waitForEditorGroups(() =>
        vscode.window.tabGroups.activeTabGroup.viewColumn === vscode.ViewColumn.One ? true : undefined,
      );
      harness.expectClosed(a);
      await harness.openTab();
      assert.deepEqual(await editorGroupShape(), layoutCase("nine Panes").shape);
      assert.deepEqual(groupTabs(), [["A"], ["B"], ["C"], ["D"], ["E"], ["F"], ["G"], ["H"], ["I"]]);
      assert.notStrictEqual(paneTerminal("A"), a);
      assert.strictEqual(paneTerminal("I"), i);
      assert.equal(vscode.window.tabGroups.activeTabGroup.viewColumn, 9);
      assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab?.label, "I");
    });
  });

  test("switches from real Tab 13 to Tab 12 while retaining the other Tab's Pane Editors behind it", async () => {
    await withLayout(
      tab13,
      async (harness) => {
        await harness.openTab("w3:t40");
        assert.deepEqual(groupTabs(), [["p6D"], ["p6E"]]);
        const d = paneTerminal("p6D");
        const e = paneTerminal("p6E");
        await harness.openTab("w3:t4Z");
        assert.deepEqual(await editorGroupShape(), {
          orientation: 0,
          groups: [
            { orientation: 1, groups: ["p69", "p6C"] },
            { orientation: 1, groups: ["p6A", "p6B"] },
          ],
        });
        assert.deepEqual(groupTabs(), [["p6D", "p69"], ["p6E", "p6C"], ["p6A"], ["p6B"]]);
        assert.strictEqual(paneTerminal("p6D"), d);
        assert.strictEqual(paneTerminal("p6E"), e);
        assert.equal(vscode.window.tabGroups.activeTabGroup.viewColumn, vscode.ViewColumn.Three);
        assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab?.label, "p6A");
      },
      [tab12],
    );
  });

  test("returns to real Tab 12 by recreating surplus Pane Editors closed before projecting Tab 13", async () => {
    await withLayout(
      tab12,
      async (harness) => {
        await harness.openTab("w3:t4Z");
        const first = paneTerminal("p69");
        const second = paneTerminal("p6C");
        const third = paneTerminal("p6A");
        const fourth = paneTerminal("p6B");
        harness.expectClosed(third, fourth);
        await harness.openTab("w3:t40");
        assert.deepEqual(await editorGroupShape(), { orientation: 1, groups: ["p6D", "p6E"] });
        assert.deepEqual(groupTabs(), [
          ["p69", "p6D"],
          ["p6C", "p6E"],
        ]);
        const d = paneTerminal("p6D");
        const e = paneTerminal("p6E");
        await harness.openTab("w3:t4Z");
        assert.deepEqual(await editorGroupShape(), {
          orientation: 0,
          groups: [
            { orientation: 1, groups: ["p69", "p6C"] },
            { orientation: 1, groups: ["p6A", "p6B"] },
          ],
        });
        assert.deepEqual(groupTabs(), [["p69", "p6D"], ["p6C", "p6E"], ["p6A"], ["p6B"]]);
        assert.strictEqual(paneTerminal("p69"), first);
        assert.strictEqual(paneTerminal("p6C"), second);
        assert.notStrictEqual(paneTerminal("p6A"), third);
        assert.notStrictEqual(paneTerminal("p6B"), fourth);
        assert.strictEqual(paneTerminal("p6D"), d);
        assert.strictEqual(paneTerminal("p6E"), e);
        assert.equal(vscode.window.tabGroups.activeTabGroup.viewColumn, vscode.ViewColumn.Three);
        assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab?.label, "p6A");
      },
      [tab13],
    );
  });
});

function layoutCase(name: string): LayoutCase {
  const fixture = layoutCases.find((candidate) => candidate.name === name);
  assert.ok(fixture);
  return fixture;
}

async function withLayout(
  fixture: LayoutCase,
  run: (harness: LayoutHarness) => Promise<void>,
  additionalFixtures: readonly LayoutCase[] = [],
): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await vscode.commands.executeCommand("workbench.action.joinAllGroups");
  const sessionId = `tab-layout-${++sequence}`;
  const fixtures = [fixture, ...additionalFixtures];
  const snapshot: HerdrSessionSnapshot = {
    version: "1",
    protocol: 1,
    focusedSpaceId: fixture.layout.spaceId,
    focusedHerdrTabId: fixture.layout.herdrTabId,
    focusedPaneId: fixture.layout.focusedPaneId,
    spaces: [
      {
        id: fixture.layout.spaceId,
        number: 1,
        label: "Space",
        focused: true,
        paneCount: fixtures.reduce((count, candidate) => count + candidate.layout.panes.length, 0),
        tabCount: fixtures.length,
        activeHerdrTabId: fixture.layout.herdrTabId,
        agentStatus: "idle",
        tokens: {},
      },
    ],
    herdrTabs: fixtures.map((candidate, index) => ({
      id: candidate.layout.herdrTabId,
      spaceId: candidate.layout.spaceId,
      number: index + 1,
      label: "Tab",
      focused: candidate === fixture,
      paneCount: candidate.layout.panes.length,
      agentStatus: "idle",
    })),
    agents: [],
    layouts: fixtures.map((candidate) => candidate.layout),
    panes: fixtures.flatMap((candidate) =>
      candidate.layout.panes.map(({ paneId }) => ({
        id: paneId,
        terminalId: paneId,
        spaceId: candidate.layout.spaceId,
        herdrTabId: candidate.layout.herdrTabId,
        focused: paneId === fixture.layout.focusedPaneId,
        agentStatus: "idle",
        revision: 1,
        terminalTitle: paneId,
        stateLabels: {},
        tokens: {},
      })),
    ),
  };
  const projection = {
    getActiveSessionProjection: (): { kind: "connected"; sessionId: string; snapshot: HerdrSessionSnapshot } => ({
      kind: "connected",
      sessionId,
      snapshot,
    }),
    onDidChangeActiveSessionProjection: () => ({ dispose: () => undefined }),
  };
  const selection = new PaneEditorSelectionModel();
  const focus = new PaneEditorFocusTracker(selection, {
    state: { focused: true },
    onDidChangeWindowState: () => ({ dispose: () => undefined }),
  });
  const live = new Map<string, number>();
  const maximum = new Map<string, number>();
  const createClient = (paneId: string) => {
    const count = (live.get(paneId) ?? 0) + 1;
    live.set(paneId, count);
    maximum.set(paneId, Math.max(maximum.get(paneId) ?? 0, count));
    let finish: () => void = () => undefined;
    const completion = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let stopped = false;
    return {
      completion,
      stop: () => {
        if (!stopped) {
          stopped = true;
          live.set(paneId, (live.get(paneId) ?? 0) - 1);
          finish();
        }
        return Promise.resolve();
      },
    };
  };
  const clients: PaneClientFactory = {
    createObserver: (request) => createClient(request.terminalId),
    createAttach: (request) => ({
      ...createClient(request.terminalId),
      sendInput: () => undefined,
      resize: () => undefined,
    }),
  };
  const ownedTerminals = new Map<vscode.Terminal, string>();
  const closed = new Set<vscode.Terminal>();
  const expectedClosed = new Set<vscode.Terminal>();
  const closeSubscription = vscode.window.onDidCloseTerminal((terminal) => closed.add(terminal));
  const manager = new PaneTerminalSurfaceManager(
    selection,
    { subscribe: () => ({ dispose: () => undefined }) },
    {
      create: (reference, column, name) => {
        const surface = new VsCodePaneTerminalSurface(
          reference,
          column,
          name,
          projection,
          focus,
          clients,
          { offer: () => ({ retract: () => undefined }) },
          { info: () => undefined, error: () => undefined, show: () => undefined },
        );
        ownedTerminals.set(surface.terminal, reference.paneId);
        return surface;
      },
    },
  );
  const navigation = new NavigationContextModel(projection, manager);
  const original = vscode.commands.registerCommand;
  const originalShowError = vscode.window.showErrorMessage;
  const errors: string[] = [];
  const prefix = `test.layout.${sequence}.`;
  let feature: OpenTabFeature | undefined;
  try {
    vscode.commands.registerCommand = (...args: Parameters<typeof original>) =>
      original(prefix + args[0], args[1], args[2]);
    vscode.window.showErrorMessage = (message: string) => {
      errors.push(message);
      return Promise.resolve(undefined);
    };
    feature = new OpenTabFeature(navigation, manager);
    vscode.commands.registerCommand = original;
    await run({
      expectClosed: (...terminals) => terminals.forEach((terminal) => expectedClosed.add(terminal)),
      openTab: async (tabId = fixture.layout.herdrTabId) => {
        const target = fixtures.find((candidate) => candidate.layout.herdrTabId === tabId);
        assert.ok(target);
        await vscode.commands.executeCommand(prefix + "herdr.openTab", tabId);
        assert.deepEqual(errors, [], "projection reports no errors");
        const livePaneIds = [...ownedTerminals.entries()]
          .filter(([terminal]) => !expectedClosed.has(terminal))
          .map(([, paneId]) => paneId);
        assert.equal(new Set(livePaneIds).size, livePaneIds.length, "exactly one live Terminal per open Pane");
        await waitForPaneTitles(livePaneIds);
        const tabs = orderedGroups().flatMap((group) => group.tabs);
        livePaneIds.forEach((paneId) => {
          assert.equal(tabs.filter((tab) => tab.label === paneId).length, 1, `Pane ${paneId} appears once`);
        });
        target.layout.panes.forEach(({ paneId }) => {
          const matches = tabs.filter((tab) => tab.label === paneId);
          assert.equal(matches.length, 1, `Pane ${paneId} appears once`);
          assert.equal(matches[0]?.isActive, true, `Pane ${paneId} is its cell's active tab`);
        });
        ownedTerminals.forEach((paneId, terminal) => {
          const shouldBeClosed = expectedClosed.has(terminal);
          assert.equal(closed.has(terminal), shouldBeClosed, `only expected displaced Pane Editor ${paneId} closes`);
          assert.equal(
            vscode.window.terminals.includes(terminal),
            !shouldBeClosed,
            "only retained Terminals stay open",
          );
        });

        maximum.forEach((count, paneId) =>
          assert.ok(count <= 1, `Pane ${paneId} had ${count} simultaneously live clients`),
        );
      },
      openPane: async (paneId, column) => {
        // A real pinned document activates even a column beyond VS Code's eight named focus commands.
        const document = await openDocument(`setup-${paneId}.txt`, column);
        const setupTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        assert.ok(setupTab);
        const pane = snapshot.panes.find((candidate) => candidate.id === paneId);
        assert.ok(pane);
        manager.openPane(paneTerminalOpenRequest(sessionId, pane, paneId));
        await waitForPaneTitles([paneId]);
        const terminal = paneTerminal(paneId);
        await vscode.window.tabGroups.close(setupTab);
        assert.equal(document.isDirty, false);
        return terminal;
      },
    });
  } finally {
    vscode.commands.registerCommand = original;
    vscode.window.showErrorMessage = originalShowError;
    closeSubscription.dispose();
    feature?.dispose();
    navigation.dispose();
    manager.dispose();
    focus.dispose();
    selection.dispose();
    const dirty = vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => tab.isDirty);
    for (const tab of dirty) {
      if (tab.input instanceof vscode.TabInputText) {
        const document = await vscode.workspace.openTextDocument(tab.input.uri);
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
      }
    }
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await vscode.commands.executeCommand("workbench.action.joinAllGroups");
  }
}

function orderedGroups(): vscode.TabGroup[] {
  return [...vscode.window.tabGroups.all].sort((left, right) => left.viewColumn - right.viewColumn);
}

function groupTabs(): string[][] {
  return orderedGroups().map((group) => group.tabs.map((tab) => tab.label));
}

function paneTerminal(paneId: string): vscode.Terminal {
  const terminal = vscode.window.terminals.find((candidate) => candidate.name === paneId);
  assert.ok(terminal, `Pane ${paneId} has a Terminal`);
  return terminal;
}

async function setGroups(count: number): Promise<void> {
  await vscode.commands.executeCommand("vscode.setEditorLayout", {
    orientation: 0,
    groups: Array.from({ length: count }, () => ({})),
  });
  await waitForEditorGroups(() => (vscode.window.tabGroups.all.length === count ? true : undefined));
}

async function openDocument(name: string, column: number): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(`untitled:${name}`));
  const viewColumn: vscode.ViewColumn = column;
  await vscode.window.showTextDocument(document, { viewColumn, preview: false });
  await waitForEditorGroups(() => {
    const active = vscode.window.tabGroups.activeTabGroup;
    const documentIsActive = active.viewColumn === viewColumn && active.activeTab?.label === name;
    return documentIsActive ? true : undefined;
  });
  return document;
}

async function waitForPaneTitles(paneIds: readonly string[]): Promise<void> {
  await waitForEditorGroups(() => {
    const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
    return paneIds.every((id) => tabs.some((tab) => tab.label === id)) ? true : undefined;
  });
}

interface EditorLayout {
  orientation?: number;
  size?: number;
  groups?: EditorLayout[];
}
async function editorGroupShape(): Promise<EditorGroupShape> {
  const layout = await vscode.commands.executeCommand<EditorLayout>("vscode.getEditorLayout");
  assert.ok(layout);
  const groups = orderedGroups();
  let index = 0;
  const visit = (node: EditorLayout, orientation: number): EditorGroupShape => {
    if (node.groups === undefined) {
      const group = groups[index++];
      assert.ok(group?.activeTab);
      return group.activeTab.label;
    }
    const direction = node.orientation ?? orientation;
    const children = node.groups.map((child) => visit(child, 1 - direction));
    const [first] = children;
    assert.ok(first);
    return children.length === 1 ? first : { orientation: direction, groups: children };
  };
  return visit(layout, 0);
}
