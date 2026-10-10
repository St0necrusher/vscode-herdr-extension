import type { HerdrLayoutPane, HerdrLayoutRectangle, HerdrTabLayout, SplitDirection } from "@api/herdr";

type TabLayoutLeaf = Readonly<{ kind: "pane"; paneId: string; size: number }>;
type TabLayoutSplit = Readonly<{
  kind: "split";
  direction: SplitDirection;
  size: number;
  children: readonly TabLayoutTree[];
}>;
export type TabLayoutTree = TabLayoutLeaf | TabLayoutSplit;

// A cut identifies the exact regions of both child nodes, whether split or leaf.
export function tabLayoutTree(layout: HerdrTabLayout): TabLayoutTree {
  const nodeRectangles = [
    ...layout.splits.map((split) => split.rectangle),
    ...layout.panes.map((pane) => pane.rectangle),
  ];
  const matchesNode = (region: HerdrLayoutRectangle): boolean =>
    nodeRectangles.some((rectangle) => sameRectangle(rectangle, region));
  const build = (region: HerdrLayoutRectangle, panes: readonly HerdrLayoutPane[], nodeSize: number): TabLayoutTree => {
    const [only, ...others] = panes;
    const isLeaf = only !== undefined && others.length === 0;
    if (isLeaf) return { kind: "pane", paneId: only.paneId, size: nodeSize };
    const split = layout.splits.find((candidate) => sameRectangle(candidate.rectangle, region));
    if (split === undefined) throw new Error("Missing layout split");
    const horizontal = split.direction === "right";
    const start = horizontal ? region.x : region.y;
    const size = horizontal ? region.width : region.height;
    const paneStart = (pane: HerdrLayoutPane): number => (horizontal ? pane.rectangle.x : pane.rectangle.y);
    const paneEnd = (pane: HerdrLayoutPane): number =>
      paneStart(pane) + (horizontal ? pane.rectangle.width : pane.rectangle.height);
    const regionsAt = (cut: number): { firstRegion: HerdrLayoutRectangle; secondRegion: HerdrLayoutRectangle } => ({
      firstRegion: horizontal ? { ...region, width: cut - start } : { ...region, height: cut - start },
      secondRegion: horizontal
        ? { ...region, x: cut, width: start + size - cut }
        : { ...region, y: cut, height: start + size - cut },
    });
    const cut = panes.map(paneEnd).find((candidate) => {
      const { firstRegion, secondRegion } = regionsAt(candidate);
      const matchesChildren = matchesNode(firstRegion) && matchesNode(secondRegion);
      return matchesChildren;
    });
    if (cut === undefined) throw new Error("Missing layout cut");
    const { firstRegion, secondRegion } = regionsAt(cut);
    const children = [
      build(
        firstRegion,
        panes.filter((pane) => paneEnd(pane) <= cut),
        horizontal ? firstRegion.width : firstRegion.height,
      ),
      build(
        secondRegion,
        panes.filter((pane) => paneStart(pane) >= cut),
        horizontal ? secondRegion.width : secondRegion.height,
      ),
    ].flatMap((child) => {
      const sharesDirection = child.kind === "split" && child.direction === split.direction;
      return sharesDirection ? child.children : [child];
    });
    return { kind: "split", direction: split.direction, size: nodeSize, children };
  };
  // The root has no parent axis; its size is an unused sentinel.
  return build(layout.area, layout.panes, 1);
}

function sameRectangle(left: HerdrLayoutRectangle, right: HerdrLayoutRectangle): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}
