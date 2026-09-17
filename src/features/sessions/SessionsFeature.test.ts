import { describe, expect, it, vi } from "vitest";
import type {
  HerdrCommandHandlers,
  HerdrCommandRegistry,
  HerdrConfiguration,
  HerdrConfigurationSource,
  HerdrSessionDiscovery,
  HerdrStatusAction,
  HerdrStatusModel,
} from "../../capabilities/sessions/index.js";
import { SessionsFeature } from "./index.js";

const defaults: HerdrConfiguration = {
  executable: "herdr",
  session: "default",
};

function connected(configuration: HerdrConfiguration): HerdrSessionDiscovery {
  return {
    kind: "connected",
    configuration,
    version: "0.9.0",
    protocol: 22,
    endpoint: "/tmp/herdr.sock",
  };
}

function stopped(configuration: HerdrConfiguration): HerdrSessionDiscovery {
  return { kind: "stopped", configuration };
}

function createConfigurationSource(initial: HerdrConfiguration) {
  let current = initial;
  let listener: (() => void) | undefined;
  const source: HerdrConfigurationSource = {
    read: () => current,
    onDidChange(nextListener) {
      listener = nextListener;
      return { dispose: () => (listener = undefined) };
    },
  };
  return {
    source,
    change(configuration: HerdrConfiguration) {
      current = configuration;
      listener?.();
    },
    hasListener: () => listener !== undefined,
  };
}

function createHarness(
  discover = vi.fn((configuration: HerdrConfiguration) =>
    Promise.resolve(connected(configuration)),
  ),
) {
  const configuration = createConfigurationSource(defaults);
  const directory = { discover, start: vi.fn(() => Promise.resolve()) };
  const rendered: HerdrStatusModel[] = [];
  let chosenAction: HerdrStatusAction | undefined;
  let handlers: HerdrCommandHandlers | undefined;
  const commands: HerdrCommandRegistry = {
    register(nextHandlers) {
      handlers = nextHandlers;
      return { dispose: () => (handlers = undefined) };
    },
  };
  const configurationActions = {
    selectExecutable: vi.fn(() => Promise.resolve()),
    openSettings: vi.fn(() => Promise.resolve()),
  };
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
    show: vi.fn(),
  };
  const feature = new SessionsFeature({
    directory,
    configuration: configuration.source,
    statusView: {
      render: (status) => rendered.push(status),
      chooseAction: () => Promise.resolve(chosenAction),
    },
    configurationActions,
    commands,
    logger,
  });
  return {
    feature,
    directory,
    configuration,
    rendered,
    configurationActions,
    logger,
    getHandlers: () => handlers,
    choose(action: HerdrStatusAction | undefined) {
      chosenAction = action;
    },
  };
}

describe("Sessions feature", () => {
  it("discovers Herdr during initialization without starting it", async () => {
    const harness = createHarness();

    await harness.feature.initialize();

    expect(harness.directory.discover).toHaveBeenCalledWith(defaults);
    expect(harness.directory.start).not.toHaveBeenCalled();
    expect(harness.feature.getCatalogState()).toEqual(connected(defaults));
  });

  it("starts a stopped Herdr Session only after an explicit operation and refreshes the catalog", async () => {
    const discover = vi
      .fn()
      .mockResolvedValueOnce(stopped(defaults))
      .mockResolvedValueOnce(connected(defaults));
    const harness = createHarness(discover);
    await harness.feature.initialize();
    harness.directory.discover.mockClear();

    await harness.feature.start();

    expect(harness.directory.start).toHaveBeenCalledWith(defaults);
    expect(harness.directory.discover).toHaveBeenCalledWith(defaults);
    expect(harness.feature.getCatalogState()).toEqual(connected(defaults));
  });

  it("does not start a running Herdr Session", async () => {
    const harness = createHarness();
    await harness.feature.initialize();

    await harness.feature.start();

    expect(harness.directory.start).not.toHaveBeenCalled();
  });

  it("uses fresh configuration and prevents stale discovery from replacing newer state", async () => {
    let resolveStale: ((value: HerdrSessionDiscovery) => void) | undefined;
    const staleConfiguration = { executable: "/old/herdr", session: "old" };
    const currentConfiguration = { executable: "/new/herdr", session: "work" };
    const discover = vi
      .fn()
      .mockResolvedValueOnce(connected(defaults))
      .mockImplementationOnce(
        () =>
          new Promise<HerdrSessionDiscovery>((resolve) => {
            resolveStale = resolve;
          }),
      )
      .mockResolvedValueOnce(connected(currentConfiguration));
    const harness = createHarness(discover);
    await harness.feature.initialize();

    harness.configuration.change(staleConfiguration);
    harness.configuration.change(currentConfiguration);
    await vi.waitFor(() =>
      expect(harness.feature.getCatalogState()).toEqual(
        connected(currentConfiguration),
      ),
    );
    resolveStale?.(connected(staleConfiguration));
    await Promise.resolve();

    expect(harness.feature.getCatalogState()).toEqual(
      connected(currentConfiguration),
    );
  });

  it("removes subscriptions and blocks late publication after disposal", async () => {
    let resolveDiscovery: ((value: HerdrSessionDiscovery) => void) | undefined;
    const discover = vi.fn(
      () =>
        new Promise<HerdrSessionDiscovery>((resolve) => {
          resolveDiscovery = resolve;
        }),
    );
    const harness = createHarness(discover);

    const initialization = harness.feature.initialize();
    harness.feature.dispose();
    resolveDiscovery?.(connected(defaults));
    await initialization;

    expect(harness.configuration.hasListener()).toBe(false);
    expect(harness.getHandlers()).toBeUndefined();
    expect(harness.feature.getCatalogState()).toEqual({
      kind: "checking",
      configuration: defaults,
    });
  });

  it("offers recovery actions for a missing executable and a stopped Herdr Session", async () => {
    const discover = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "missing-executable",
        configuration: defaults,
      })
      .mockResolvedValueOnce(stopped(defaults));
    const harness = createHarness(discover);
    await harness.feature.initialize();

    expect(harness.rendered.at(-1)?.availableActions).toContain(
      "select-executable",
    );

    await harness.feature.retry();

    expect(harness.rendered.at(-1)?.availableActions).toContain("start");
  });

  it("routes registered commands to their public operations", async () => {
    const discover = vi.fn().mockResolvedValue(stopped(defaults));
    const harness = createHarness(discover);
    await harness.feature.initialize();
    const handlers = harness.getHandlers();
    expect(handlers).toBeDefined();

    await handlers?.retryDiscovery();
    await handlers?.start();
    await handlers?.selectExecutable();
    await handlers?.openSettings();
    harness.choose("show-diagnostics");
    await handlers?.showStatusActions();

    expect(discover).toHaveBeenCalledTimes(3);
    expect(harness.directory.start).toHaveBeenCalledOnce();
    expect(
      harness.configurationActions.selectExecutable,
    ).toHaveBeenCalledOnce();
    expect(harness.configurationActions.openSettings).toHaveBeenCalledOnce();
    expect(harness.logger.show).toHaveBeenCalledOnce();
  });
});
