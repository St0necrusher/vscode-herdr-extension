import type {
  HerdrAvailability,
  HerdrSettings,
  LifecycleDependencies,
  LifecycleFeature,
} from "./contracts.js";

export function createLifecycleFeature(
  dependencies: LifecycleDependencies,
): LifecycleFeature {
  let disposed = false;
  let activated = false;
  let revision = 0;
  let availability: HerdrAvailability = {
    kind: "checking",
    settings: dependencies.settings.read(),
  };
  let settingsSubscription: { dispose(): void } | undefined;

  const discover = async (): Promise<void> => {
    const settings = dependencies.settings.read();
    const requestRevision = ++revision;
    availability = { kind: "checking", settings };
    dependencies.view.render(availability);
    dependencies.logger.info(
      `Discovering Herdr Session "${settings.session}" with ${settings.executable}.`,
    );

    try {
      const discovered = await dependencies.herdr.inspect(settings);
      if (disposed || requestRevision !== revision) return;
      availability = discovered;
      dependencies.view.render(discovered);
      dependencies.logger.info(discovered.detail);
    } catch (error) {
      if (disposed || requestRevision !== revision) return;
      availability = {
        kind: "error",
        settings,
        detail: error instanceof Error ? error.message : String(error),
      };
      dependencies.view.render(availability);
      dependencies.logger.error("Herdr discovery failed.", error);
    }
  };

  return {
    async activate() {
      if (activated || disposed) return;
      activated = true;
      settingsSubscription = dependencies.settings.onDidChange(() => {
        void discover();
      });
      await discover();
    },
    retry: discover,
    async start() {
      if (disposed || availability.kind !== "stopped") return;
      const settings: HerdrSettings = dependencies.settings.read();
      dependencies.logger.info(
        `Starting Herdr Session "${settings.session}" by explicit request.`,
      );
      const startRevision = revision;
      try {
        await dependencies.herdr.start(settings);
        if (startRevision !== revision) return;
        await discover();
      } catch (error) {
        if (startRevision !== revision) return;
        availability = {
          kind: "error",
          settings,
          detail: error instanceof Error ? error.message : String(error),
        };
        dependencies.view.render(availability);
        dependencies.logger.error("Herdr startup failed.", error);
      }
    },
    getAvailability() {
      return availability;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision += 1;
      settingsSubscription?.dispose();
      settingsSubscription = undefined;
    },
  };
}
