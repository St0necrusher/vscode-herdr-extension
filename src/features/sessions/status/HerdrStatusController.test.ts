import { describe, expect, it, vi } from "vitest";
import type { HerdrSessionCatalogState } from "#capabilities/sessions";
import type { HerdrStatusAction, HerdrStatusModel } from "../capabilities/index.js";
import { HerdrStatusController } from "./HerdrStatusController.js";

function harness() {
  let state: HerdrSessionCatalogState = {
    kind: "missing-executable",
    configuration: { executable: "herdr", session: "default" },
  };
  let listener: ((state: HerdrSessionCatalogState) => void) | undefined;
  const catalog = {
    start: vi.fn(() => Promise.resolve()),
    retry: vi.fn(() => Promise.resolve()),
  };
  const configuration = {
    selectExecutable: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(() => Promise.resolve()),
  };
  const logger = { info: vi.fn(), error: vi.fn(), show: vi.fn() };
  const view = {
    render: vi.fn<(model: HerdrStatusModel) => void>(),
    chooseAction: vi.fn<() => Promise<HerdrStatusAction | undefined>>(),
  };
  const controller = new HerdrStatusController(
    {
      getState: () => state,
      onDidChange(callback) {
        listener = callback;
        return {
          dispose: () => {
            listener = undefined;
          },
        };
      },
    },
    catalog,
    view,
    configuration,
    logger,
  );
  return {
    controller,
    catalog,
    configuration,
    logger,
    view,
    change(kind: "stopped") {
      state = { kind, configuration: state.configuration };
      listener?.(state);
    },
    hasListener: () => listener !== undefined,
  };
}

describe("Session status policy", () => {
  it("offers missing-executable recovery and explicit start for stopped Sessions", () => {
    const h = harness();
    try {
      expect(h.view.render.mock.calls.at(-1)?.[0].availableActions).toEqual(
        expect.arrayContaining(["select-executable", "open-settings", "retry", "show-diagnostics"]),
      );
      h.change("stopped");
      expect(h.view.render.mock.calls.at(-1)?.[0].availableActions).toContain("start");
    } finally {
      h.controller.dispose();
    }
  });

  it.each<HerdrStatusAction>(["start", "retry", "select-executable", "open-settings", "show-diagnostics"])(
    "performs the chosen %s action",
    async (action) => {
      const h = harness();
      try {
        h.change("stopped");
        h.view.chooseAction.mockResolvedValue(action);
        await h.controller.showActions();
        const operation = {
          start: h.catalog.start,
          retry: h.catalog.retry,
          "select-executable": h.configuration.selectExecutable,
          "open-settings": h.configuration.openSettings,
          "show-diagnostics": h.logger.show,
        }[action];
        expect(operation).toHaveBeenCalledOnce();
      } finally {
        h.controller.dispose();
      }
    },
  );

  it("ignores a pending action after disposal and removes its subscription", async () => {
    const h = harness();
    let finish: ((action: HerdrStatusAction) => void) | undefined;
    h.view.chooseAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = h.controller.showActions();
    h.controller.dispose();
    finish?.("start");
    await pending;
    expect(h.catalog.start).not.toHaveBeenCalled();
    expect(h.hasListener()).toBe(false);
  });
});
