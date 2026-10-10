import { describe, expect, it } from "vitest";
import { layoutCases } from "../../../test/extension/tabLayoutFixtures.test";
import { tabLayoutTree } from "./tabLayoutTree";

describe("Herdr Tab layout tree", () => {
  layoutCases.forEach(({ name, layout, tree }) => {
    it(`reconstructs ${name} with flattened directions and cell sizes independently of wire order and zoom`, () => {
      expect(tabLayoutTree(layout)).toEqual(tree);
    });
  });
});
