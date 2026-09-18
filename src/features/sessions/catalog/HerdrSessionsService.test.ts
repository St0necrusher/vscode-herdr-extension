import { describe, expect, it, vi } from "vitest";
import type {
  HerdrConfiguration,
  HerdrConfigurationSource,
  HerdrSessionDiscovery,
} from "#capabilities/sessions";
import { HerdrSessionsService } from "./HerdrSessionsService.js";

const defaults: HerdrConfiguration = {
  executable: "herdr",
  session: "default",
};
const connected = (
  configuration: HerdrConfiguration,
): HerdrSessionDiscovery => ({
  kind: "connected",
  configuration,
  version: "0.9.0",
  protocol: 22,
  endpoint: "/tmp/herdr.sock",
});

function harness(
  discover = vi.fn((configuration: HerdrConfiguration) =>
    Promise.resolve(connected(configuration)),
  ),
) {
  let current = defaults;
  let listener: (() => void) | undefined;
  const configuration: HerdrConfigurationSource = {
    read: () => current,
    onDidChange(callback) {
      listener = callback;
      return {
        dispose: () => {
          listener = undefined;
        },
      };
    },
  };
  const directory = { discover, start: vi.fn(() => Promise.resolve()) };
  const catalog = new HerdrSessionsService(directory, configuration, {
    info: vi.fn(),
    error: vi.fn(),
    show: vi.fn(),
  });
  return {
    catalog,
    directory,
    change(value: HerdrConfiguration) {
      current = value;
      listener?.();
    },
    hasListener: () => listener !== undefined,
  };
}

describe("Session catalog", () => {
  it("discovers without starting Herdr", async () => {
    const h = harness();
    try {
      await h.catalog.initialize();
      expect(h.directory.discover).toHaveBeenCalledWith(defaults);
      expect(h.directory.start).not.toHaveBeenCalled();
      expect(h.catalog.getState()).toEqual(connected(defaults));
    } finally {
      h.catalog.dispose();
    }
  });

  it("starts a stopped Session only explicitly, then refreshes", async () => {
    const h = harness(
      vi
        .fn()
        .mockResolvedValueOnce({ kind: "stopped", configuration: defaults })
        .mockResolvedValueOnce(connected(defaults)),
    );
    try {
      await h.catalog.initialize();
      expect(h.directory.start).not.toHaveBeenCalled();
      h.directory.discover.mockClear();
      await h.catalog.start();
      expect(h.directory.start).toHaveBeenCalledWith(defaults);
      expect(h.directory.discover).toHaveBeenCalledWith(defaults);
      expect(h.catalog.getState()).toEqual(connected(defaults));
    } finally {
      h.catalog.dispose();
    }
  });

  it("does not start a running Session", async () => {
    const h = harness();
    try {
      await h.catalog.initialize();
      await h.catalog.start();
      expect(h.directory.start).not.toHaveBeenCalled();
    } finally {
      h.catalog.dispose();
    }
  });

  it("uses fresh configuration and ignores superseded discovery", async () => {
    let finish: ((value: HerdrSessionDiscovery) => void) | undefined;
    const old = { executable: "/old/herdr", session: "old" };
    const current = { executable: "/new/herdr", session: "work" };
    const h = harness(
      vi
        .fn()
        .mockResolvedValueOnce(connected(defaults))
        .mockImplementationOnce(
          () =>
            new Promise<HerdrSessionDiscovery>((resolve) => {
              finish = resolve;
            }),
        )
        .mockResolvedValueOnce(connected(current)),
    );
    try {
      await h.catalog.initialize();
      h.change(old);
      h.change(current);
      await vi.waitFor(() =>
        expect(h.catalog.getState()).toEqual(connected(current)),
      );
      finish?.(connected(old));
      await Promise.resolve();
      expect(h.directory.discover).toHaveBeenLastCalledWith(current);
      expect(h.catalog.getState()).toEqual(connected(current));
    } finally {
      h.catalog.dispose();
    }
  });

  it("removes configuration subscriptions and blocks late publication after disposal", async () => {
    let finish: ((value: HerdrSessionDiscovery) => void) | undefined;
    const h = harness(
      vi.fn(
        () =>
          new Promise<HerdrSessionDiscovery>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const published = vi.fn();
    h.catalog.onDidChange(published);
    const initialization = h.catalog.initialize();
    h.catalog.dispose();
    published.mockClear();
    finish?.(connected(defaults));
    await initialization;
    expect(h.hasListener()).toBe(false);
    expect(published).not.toHaveBeenCalled();
    expect(h.catalog.getState()).toEqual({
      kind: "checking",
      configuration: defaults,
    });
  });
});
