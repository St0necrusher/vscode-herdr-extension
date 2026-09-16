import { describe, expect, it, vi } from "vitest";
import {
  createLifecycleFeature,
  type HerdrDiscoveryResult,
  type HerdrSettings,
  type HerdrSettingsPort,
} from "./index.js";

const initialSettings: HerdrSettings = {
  executable: "herdr",
  session: "default",
};

function connected(settings: HerdrSettings): HerdrDiscoveryResult {
  return {
    kind: "connected",
    settings,
    detail: "Connected",
    version: "0.9.0",
    protocol: 22,
    endpoint: "/tmp/herdr.sock",
  };
}

function createSettingsPort(initial: HerdrSettings) {
  let current = initial;
  let listener: (() => void) | undefined;
  const port: HerdrSettingsPort = {
    read: () => current,
    onDidChange: (nextListener) => {
      listener = nextListener;
      return { dispose: () => (listener = undefined) };
    },
  };

  return {
    port,
    change(next: HerdrSettings) {
      current = next;
      listener?.();
    },
    hasListener: () => listener !== undefined,
  };
}

function createHarness(
  inspect = vi.fn((settings: HerdrSettings) =>
    Promise.resolve(connected(settings)),
  ),
) {
  const settings = createSettingsPort(initialSettings);
  const herdr = { inspect, start: vi.fn(() => Promise.resolve()) };
  const view = { render: vi.fn() };
  const logger = { info: vi.fn(), error: vi.fn() };
  const feature = createLifecycleFeature({
    herdr,
    settings: settings.port,
    view,
    logger,
  });
  return { feature, herdr, settings, view, logger };
}

describe("lifecycle feature", () => {
  it("discovers availability during activation without starting Herdr", async () => {
    const { feature, herdr, view } = createHarness();

    await feature.activate();

    expect(herdr.inspect).toHaveBeenCalledWith(initialSettings);
    expect(herdr.start).not.toHaveBeenCalled();
    expect(view.render).toHaveBeenLastCalledWith(connected(initialSettings));
  });

  it("starts a stopped Session only after an explicit request and refreshes availability", async () => {
    const inspect = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "stopped",
        settings: initialSettings,
        detail: "The default Herdr Session is stopped.",
      })
      .mockResolvedValueOnce(connected(initialSettings));
    const { feature, herdr } = createHarness(inspect);
    await feature.activate();
    herdr.inspect.mockClear();

    await feature.start();

    expect(herdr.start).toHaveBeenCalledOnce();
    expect(herdr.start).toHaveBeenCalledWith(initialSettings);
    expect(herdr.inspect).toHaveBeenCalledOnce();
  });

  it("does not start a Session that is already running", async () => {
    const { feature, herdr } = createHarness();
    await feature.activate();

    await feature.start();

    expect(herdr.start).not.toHaveBeenCalled();
  });

  it("rediscovers with fresh settings when configuration changes", async () => {
    const { feature, herdr, settings } = createHarness();
    await feature.activate();
    herdr.inspect.mockClear();

    const updated = { executable: "/opt/homebrew/bin/herdr", session: "work" };
    settings.change(updated);
    await vi.waitFor(() => expect(herdr.inspect).toHaveBeenCalledWith(updated));
  });

  it("disposes the settings listener and ignores an in-flight result", async () => {
    let resolveInspect: ((result: HerdrDiscoveryResult) => void) | undefined;
    const inspect = vi.fn(
      () =>
        new Promise<HerdrDiscoveryResult>((resolve) => {
          resolveInspect = resolve;
        }),
    );
    const { feature, settings, view } = createHarness(inspect);

    const activation = feature.activate();
    expect(settings.hasListener()).toBe(true);
    feature.dispose();
    resolveInspect?.(connected(initialSettings));
    await activation;

    expect(settings.hasListener()).toBe(false);
    expect(view.render).toHaveBeenCalledTimes(1);
    expect(view.render).toHaveBeenLastCalledWith({
      kind: "checking",
      settings: initialSettings,
    });
  });
});
