import { describe, expect, it } from "vitest";
import type { HerdrSpace } from "@api/herdr";
import { worktreeGroup } from "./worktreeGroup";

function space(id: string, isLinkedWorktree?: boolean, repositoryKey = "repository"): HerdrSpace {
  return {
    id,
    number: 1,
    label: id,
    focused: false,
    paneCount: 0,
    tabCount: 0,
    activeHerdrTabId: "",
    agentStatus: "idle",
    tokens: {},
    ...(isLinkedWorktree === undefined
      ? {}
      : {
          worktree: {
            checkoutPath: `/checkouts/${id}`,
            isLinkedWorktree,
            repositoryKey,
            repositoryName: "Project",
            repositoryRoot: "/repositories/project",
          },
        }),
  };
}

describe("worktreeGroup", () => {
  it("returns the primary first and linked checkouts of only its repository in server order", () => {
    const primary = space("primary", false);
    const first = space("first", true);
    const second = space("second", true);
    const unrelated = space("unrelated", false, "other-repository");
    expect(worktreeGroup(primary, [first, unrelated, primary, second])).toEqual([primary, first, second]);
  });

  it("requires a primary checkout and at least one linked checkout", () => {
    const primary = space("primary", false);
    const linked = space("linked", true);
    const withoutWorktree = space("without-worktree");
    expect(worktreeGroup(primary, [primary])).toBeUndefined();
    expect(worktreeGroup(linked, [primary, linked])).toBeUndefined();
    expect(worktreeGroup(withoutWorktree, [withoutWorktree, linked])).toBeUndefined();
  });

  it("does not group a repository with another primary checkout", () => {
    const primary = space("primary", false);
    const otherPrimary = space("other-primary", false);
    const linked = space("linked", true);
    expect(worktreeGroup(primary, [primary, otherPrimary, linked])).toBeUndefined();
  });
});
