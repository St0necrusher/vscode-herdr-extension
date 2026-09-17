import type { HerdrLogger } from "#capabilities/runtime";
import type {
  HerdrConfigurationActions,
  HerdrSessionCatalogState,
  HerdrStatusAction,
  HerdrStatusModel,
  HerdrStatusView,
} from "#capabilities/sessions";
import type {
  HerdrSessionCatalogOperations,
  HerdrSessionCatalogStateSource,
  HerdrStatusOperations,
} from "../capabilities/index.js";

const standardActions: readonly HerdrStatusAction[] = [
  "retry",
  "open-settings",
  "show-diagnostics",
];

export class HerdrStatusController implements HerdrStatusOperations {
  private readonly stateSource: HerdrSessionCatalogStateSource;
  private readonly catalog: HerdrSessionCatalogOperations;
  private readonly view: HerdrStatusView;
  private readonly configurationActions: HerdrConfigurationActions;
  private readonly logger: HerdrLogger;
  private readonly subscription: { dispose(): void };
  private disposed = false;
  private revision = 0;

  constructor(
    stateSource: HerdrSessionCatalogStateSource,
    catalog: HerdrSessionCatalogOperations,
    view: HerdrStatusView,
    configurationActions: HerdrConfigurationActions,
    logger: HerdrLogger,
  ) {
    this.stateSource = stateSource;
    this.catalog = catalog;
    this.view = view;
    this.configurationActions = configurationActions;
    this.logger = logger;
    this.subscription = stateSource.onDidChange((state) => this.render(state));
    this.render(stateSource.getState());
  }

  async showActions(): Promise<void> {
    if (this.disposed) return;
    const requestRevision = this.revision;
    const action = await this.view.chooseAction(
      statusModel(this.stateSource.getState()),
    );
    if (requestRevision !== this.revision || action === undefined) return;
    await this.perform(action);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.revision += 1;
    this.subscription.dispose();
  }

  private render(state: HerdrSessionCatalogState): void {
    if (this.disposed) return;
    this.view.render(statusModel(state));
  }

  private async perform(action: HerdrStatusAction): Promise<void> {
    switch (action) {
      case "start":
        await this.catalog.start();
        break;
      case "select-executable":
        await this.configurationActions.selectExecutable();
        break;
      case "open-settings":
        await this.configurationActions.openSettings();
        break;
      case "retry":
        await this.catalog.retry();
        break;
      case "show-diagnostics":
        this.logger.show();
        break;
    }
  }
}

function statusModel(state: HerdrSessionCatalogState): HerdrStatusModel {
  const identity = {
    herdrSession: state.configuration.session,
    executable: state.configuration.executable,
  };

  switch (state.kind) {
    case "checking":
      return {
        ...identity,
        kind: state.kind,
        availableActions: standardActions,
      };
    case "missing-executable":
      return {
        ...identity,
        kind: state.kind,
        availableActions: ["select-executable", ...standardActions],
      };
    case "stopped":
      return {
        ...identity,
        kind: state.kind,
        availableActions: ["start", ...standardActions],
      };
    case "connected":
      return {
        ...identity,
        kind: state.kind,
        version: state.version,
        protocol: state.protocol,
        endpoint: state.endpoint,
        availableActions: standardActions,
      };
    case "incompatible":
      return {
        ...identity,
        kind: state.kind,
        ...(state.version === undefined ? {} : { version: state.version }),
        ...(state.protocol === undefined ? {} : { protocol: state.protocol }),
        ...(state.endpoint === undefined ? {} : { endpoint: state.endpoint }),
        availableActions: standardActions,
      };
    case "error":
      return {
        ...identity,
        kind: state.kind,
        diagnostic: state.diagnostic,
        availableActions: standardActions,
      };
  }
}
