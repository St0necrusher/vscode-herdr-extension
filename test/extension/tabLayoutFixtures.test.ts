import type { HerdrLayoutRectangle, HerdrTabLayout } from "@api/herdr";

interface SplitShape {
  readonly orientation: number;
  readonly groups: readonly EditorGroupShape[];
}
export type EditorGroupShape = string | SplitShape;
export type LayoutCase = Readonly<{
  name: string;
  layout: HerdrTabLayout;
  tree: ExpectedTree;
  shape: EditorGroupShape;
}>;
type Leaf = Readonly<{ kind: "pane"; paneId: string; size: number }>;
type Split = Readonly<{ kind: "split"; direction: "right" | "down"; size: number; children: readonly ExpectedTree[] }>;
export type ExpectedTree = Leaf | Split;
const pane = (paneId: string, size: number): Leaf => ({ kind: "pane", paneId, size });
const split = (direction: "right" | "down", size: number, ...children: readonly ExpectedTree[]): Split => ({
  kind: "split",
  direction,
  size,
  children,
});

type FixtureLeaf = Readonly<{ kind: "pane"; paneId: string }>;
type FixtureSplit = Readonly<{
  kind: "split";
  direction: "right" | "down";
  children: readonly [FixtureNode, FixtureNode];
}>;
type FixtureNode = FixtureLeaf | FixtureSplit;
const sourcePane = (paneId: string): FixtureLeaf => ({ kind: "pane", paneId });
const sourceSplit = (direction: "right" | "down", first: FixtureNode, second: FixtureNode): FixtureSplit => ({
  kind: "split",
  direction,
  children: [first, second],
});

function layout(tree: FixtureNode): HerdrTabLayout {
  const panes: HerdrTabLayout["panes"][number][] = [];
  const splits: HerdrTabLayout["splits"][number][] = [];
  const visit = (node: FixtureNode, rectangle: HerdrLayoutRectangle): void => {
    if (node.kind === "pane") {
      panes.push({ paneId: node.paneId, focused: false, rectangle });
    } else {
      splits.push({ id: `split-${splits.length}`, direction: node.direction, ratio: 0.5, rectangle });
      const horizontal = node.direction === "right";
      const firstSize = Math.ceil((horizontal ? rectangle.width : rectangle.height) / 2);
      visit(node.children[0], horizontal ? { ...rectangle, width: firstSize } : { ...rectangle, height: firstSize });
      visit(
        node.children[1],
        horizontal
          ? { ...rectangle, x: rectangle.x + firstSize, width: rectangle.width - firstSize }
          : { ...rectangle, y: rectangle.y + firstSize, height: rectangle.height - firstSize },
      );
    }
  };
  visit(tree, { x: 0, y: 0, width: 43, height: 31 });
  const lastPane = panes.at(-1);
  if (lastPane === undefined) throw new Error("Fixture has no Panes");
  return {
    spaceId: "space",
    herdrTabId: "tab",
    zoomed: true,
    area: { x: 0, y: 0, width: 43, height: 31 },
    focusedPaneId: lastPane.paneId,
    panes: [...panes].reverse(),
    splits: [...splits].reverse(),
  };
}

const generated: readonly (Omit<LayoutCase, "layout"> & { source: FixtureNode })[] = [
  { name: "single", source: sourcePane("A"), tree: pane("A", 1), shape: "A" },
  {
    name: "right",
    source: sourceSplit("right", sourcePane("A"), sourcePane("B")),
    tree: split("right", 1, pane("A", 22), pane("B", 21)),
    shape: { orientation: 0, groups: ["A", "B"] },
  },
  {
    name: "down",
    source: sourceSplit("down", sourcePane("A"), sourcePane("B")),
    tree: split("down", 1, pane("A", 16), pane("B", 15)),
    shape: { orientation: 1, groups: ["A", "B"] },
  },
  {
    name: "right with down on second",
    source: sourceSplit("right", sourcePane("A"), sourceSplit("down", sourcePane("B"), sourcePane("C"))),
    tree: split("right", 1, pane("A", 22), split("down", 21, pane("B", 16), pane("C", 15))),
    shape: { orientation: 0, groups: ["A", { orientation: 1, groups: ["B", "C"] }] },
  },
  {
    name: "right with down on first",
    source: sourceSplit("right", sourceSplit("down", sourcePane("A"), sourcePane("B")), sourcePane("C")),
    tree: split("right", 1, split("down", 22, pane("A", 16), pane("B", 15)), pane("C", 21)),
    shape: { orientation: 0, groups: [{ orientation: 1, groups: ["A", "B"] }, "C"] },
  },
  {
    name: "nested right",
    source: sourceSplit("right", sourceSplit("right", sourcePane("A"), sourcePane("B")), sourcePane("C")),
    tree: split("right", 1, pane("A", 11), pane("B", 11), pane("C", 21)),
    shape: { orientation: 0, groups: ["A", "B", "C"] },
  },
];

const weighted: LayoutCase = {
  name: "2:1 split",
  tree: split("right", 1, pane("A", 60), pane("B", 30)),
  shape: { orientation: 0, groups: ["A", "B"] },
  layout: {
    spaceId: "space",
    herdrTabId: "tab",
    zoomed: false,
    area: { x: 0, y: 0, width: 90, height: 30 },
    focusedPaneId: "B",
    panes: [
      { paneId: "A", focused: false, rectangle: { x: 0, y: 0, width: 60, height: 30 } },
      { paneId: "B", focused: true, rectangle: { x: 60, y: 0, width: 30, height: 30 } },
    ],
    splits: [{ id: "root", direction: "right", ratio: 2 / 3, rectangle: { x: 0, y: 0, width: 90, height: 30 } }],
  },
};

const ninePanes: LayoutCase = {
  name: "nine Panes",
  tree: split(
    "right",
    1,
    split("down", 30, pane("A", 30), pane("B", 30), pane("C", 30)),
    split("down", 30, pane("D", 30), pane("E", 30), pane("F", 30)),
    split("down", 30, pane("G", 30), pane("H", 30), pane("I", 30)),
  ),
  shape: {
    orientation: 0,
    groups: [
      { orientation: 1, groups: ["A", "B", "C"] },
      { orientation: 1, groups: ["D", "E", "F"] },
      { orientation: 1, groups: ["G", "H", "I"] },
    ],
  },
  layout: {
    spaceId: "space",
    herdrTabId: "tab",
    zoomed: false,
    area: { x: 0, y: 0, width: 90, height: 90 },
    focusedPaneId: "I",
    panes: [
      { paneId: "A", focused: false, rectangle: { x: 0, y: 0, width: 30, height: 30 } },
      { paneId: "B", focused: false, rectangle: { x: 0, y: 30, width: 30, height: 30 } },
      { paneId: "C", focused: false, rectangle: { x: 0, y: 60, width: 30, height: 30 } },
      { paneId: "D", focused: false, rectangle: { x: 30, y: 0, width: 30, height: 30 } },
      { paneId: "E", focused: false, rectangle: { x: 30, y: 30, width: 30, height: 30 } },
      { paneId: "F", focused: false, rectangle: { x: 30, y: 60, width: 30, height: 30 } },
      { paneId: "G", focused: false, rectangle: { x: 60, y: 0, width: 30, height: 30 } },
      { paneId: "H", focused: false, rectangle: { x: 60, y: 30, width: 30, height: 30 } },
      { paneId: "I", focused: true, rectangle: { x: 60, y: 60, width: 30, height: 30 } },
    ],
    splits: [
      { id: "root", direction: "right", ratio: 1 / 3, rectangle: { x: 0, y: 0, width: 90, height: 90 } },
      { id: "right", direction: "right", ratio: 0.5, rectangle: { x: 30, y: 0, width: 60, height: 90 } },
      { id: "left-top", direction: "down", ratio: 1 / 3, rectangle: { x: 0, y: 0, width: 30, height: 90 } },
      { id: "left-bottom", direction: "down", ratio: 0.5, rectangle: { x: 0, y: 30, width: 30, height: 60 } },
      { id: "middle-top", direction: "down", ratio: 1 / 3, rectangle: { x: 30, y: 0, width: 30, height: 90 } },
      { id: "middle-bottom", direction: "down", ratio: 0.5, rectangle: { x: 30, y: 30, width: 30, height: 60 } },
      { id: "right-top", direction: "down", ratio: 1 / 3, rectangle: { x: 60, y: 0, width: 30, height: 90 } },
      { id: "right-bottom", direction: "down", ratio: 0.5, rectangle: { x: 60, y: 30, width: 30, height: 60 } },
    ],
  },
};

export const tab13: LayoutCase = {
  name: "real Tab 13",
  tree: split("down", 1, pane("p6D", 29), pane("p6E", 28)),
  shape: { orientation: 1, groups: ["p6D", "p6E"] },
  layout: {
    spaceId: "w3",
    herdrTabId: "w3:t40",
    zoomed: false,
    area: { x: 0, y: 0, width: 53, height: 57 },
    focusedPaneId: "p6E",
    panes: [
      { paneId: "p6D", focused: false, rectangle: { x: 0, y: 0, width: 53, height: 29 } },
      { paneId: "p6E", focused: true, rectangle: { x: 0, y: 29, width: 53, height: 28 } },
    ],
    splits: [{ id: "split_0_root", direction: "down", ratio: 0.5, rectangle: { x: 0, y: 0, width: 53, height: 57 } }],
  },
};

export const tab12: LayoutCase = {
  name: "real Tab 12",
  tree: split(
    "right",
    1,
    split("down", 27, pane("p69", 29), pane("p6C", 28)),
    split("down", 26, pane("p6A", 29), pane("p6B", 28)),
  ),
  shape: {
    orientation: 0,
    groups: [
      { orientation: 1, groups: ["p69", "p6C"] },
      { orientation: 1, groups: ["p6A", "p6B"] },
    ],
  },
  layout: {
    spaceId: "w3",
    herdrTabId: "w3:t4Z",
    zoomed: false,
    area: { x: 0, y: 0, width: 53, height: 57 },
    focusedPaneId: "p6A",
    panes: [
      { paneId: "p69", focused: false, rectangle: { x: 0, y: 0, width: 27, height: 29 } },
      { paneId: "p6C", focused: false, rectangle: { x: 0, y: 29, width: 27, height: 28 } },
      { paneId: "p6A", focused: true, rectangle: { x: 27, y: 0, width: 26, height: 29 } },
      { paneId: "p6B", focused: false, rectangle: { x: 27, y: 29, width: 26, height: 28 } },
    ],
    splits: [
      { id: "split_0_root", direction: "right", ratio: 0.5, rectangle: { x: 0, y: 0, width: 53, height: 57 } },
      { id: "split_1_0", direction: "down", ratio: 0.5, rectangle: { x: 0, y: 0, width: 27, height: 57 } },
      { id: "split_2_1", direction: "down", ratio: 0.5, rectangle: { x: 27, y: 0, width: 26, height: 57 } },
    ],
  },
};

export const layoutCases: readonly LayoutCase[] = [
  tab13,
  tab12,
  weighted,
  ninePanes,
  ...generated.map(({ source, ...fixture }) => ({ ...fixture, layout: layout(source) })),
  {
    name: "live 2x2 probe",
    tree: split(
      "right",
      1,
      split("down", 22, pane("p5Y", 16), pane("p61", 15)),
      split("down", 21, pane("p5Z", 16), pane("p50", 15)),
    ),
    shape: {
      orientation: 0,
      groups: [
        { orientation: 1, groups: ["p5Y", "p61"] },
        { orientation: 1, groups: ["p5Z", "p50"] },
      ],
    },
    layout: {
      spaceId: "space",
      herdrTabId: "tab",
      zoomed: false,
      area: { x: 0, y: 0, width: 43, height: 31 },
      focusedPaneId: "p5Y",
      panes: [
        { paneId: "p5Y", focused: true, rectangle: { x: 0, y: 0, width: 22, height: 16 } },
        { paneId: "p61", focused: false, rectangle: { x: 0, y: 16, width: 22, height: 15 } },
        { paneId: "p5Z", focused: false, rectangle: { x: 22, y: 0, width: 21, height: 16 } },
        { paneId: "p50", focused: false, rectangle: { x: 22, y: 16, width: 21, height: 15 } },
      ],
      splits: [
        { id: "split_0_root", direction: "right", ratio: 0.5, rectangle: { x: 0, y: 0, width: 43, height: 31 } },
        { id: "split_1_0", direction: "down", ratio: 0.5, rectangle: { x: 0, y: 0, width: 22, height: 31 } },
        { id: "split_2_1", direction: "down", ratio: 0.5, rectangle: { x: 22, y: 0, width: 21, height: 31 } },
      ],
    },
  },
];
