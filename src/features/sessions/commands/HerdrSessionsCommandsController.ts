import type { HerdrConfigurationActions } from "#capabilities/sessions";
import type {
  HerdrCommandRegistry,
  HerdrSessionCatalogOperations,
  HerdrStatusOperations,
} from "../capabilities/index.js";

export class HerdrSessionsCommandsController {
  private readonly registration: { dispose(): void };

  constructor(
    registry: HerdrCommandRegistry,
    catalog: HerdrSessionCatalogOperations,
    status: HerdrStatusOperations,
    configurationActions: HerdrConfigurationActions,
  ) {
    this.registration = registry.register({
      showStatusActions: () => status.showActions(),
      retryDiscovery: () => catalog.retry(),
      start: () => catalog.start(),
      selectExecutable: () => configurationActions.selectExecutable(),
      openSettings: () => configurationActions.openSettings(),
    });
  }

  dispose(): void {
    this.registration.dispose();
  }
}
