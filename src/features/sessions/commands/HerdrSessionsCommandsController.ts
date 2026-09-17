import type {
  HerdrCommandRegistry,
  HerdrConfigurationActions,
} from "../../../capabilities/sessions/index.js";
import type {
  HerdrSessionCatalogOperations,
  HerdrStatusOperations,
} from "../capabilities/index.js";

export class HerdrSessionsCommandsController {
  readonly #registration: { dispose(): void };

  constructor(
    registry: HerdrCommandRegistry,
    catalog: HerdrSessionCatalogOperations,
    status: HerdrStatusOperations,
    configurationActions: HerdrConfigurationActions,
  ) {
    this.#registration = registry.register({
      showStatusActions: () => status.showActions(),
      retryDiscovery: () => catalog.retry(),
      start: () => catalog.start(),
      selectExecutable: () => configurationActions.selectExecutable(),
      openSettings: () => configurationActions.openSettings(),
    });
  }

  dispose(): void {
    this.#registration.dispose();
  }
}
