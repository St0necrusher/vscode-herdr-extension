import type { HerdrSpace } from "@api/herdr";

// Herdr's rule: a primary checkout with linked worktrees of the same repository, and no other primary checkout of it.
export function worktreeGroup(primary: HerdrSpace, spaces: readonly HerdrSpace[]): readonly HerdrSpace[] | undefined {
  const worktree = primary.worktree;
  const isPrimaryCheckout = worktree !== undefined && !worktree.isLinkedWorktree;
  if (!isPrimaryCheckout) return undefined;

  const sameRepository = spaces.filter((space) => {
    const isOtherCheckoutOfRepository =
      space.id !== primary.id && space.worktree?.repositoryKey === worktree.repositoryKey;
    return isOtherCheckoutOfRepository;
  });
  const linked = sameRepository.filter((space) => space.worktree?.isLinkedWorktree === true);
  const allOthersAreLinked = linked.length === sameRepository.length;
  const isGroup = linked.length > 0 && allOthersAreLinked;
  return isGroup ? [primary, ...linked] : undefined;
}
