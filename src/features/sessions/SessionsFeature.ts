import * as vscode from "vscode";
import type { HerdrLogger } from "@capabilities/runtime";
import type {
  HerdrConfigurationActions,
  HerdrConfigurationSource,
  HerdrSessionConnectionFactory,
  HerdrSessionDirectory,
} from "@capabilities/sessions";
import type { PersistentKeyValueStorage } from "./capabilities";
import { SessionsModel } from "./SessionsModel";
import { VsCodeSessionsView } from "./view";
import { StatusFeature } from "./status";

export type SessionsFeatureDependencies = Readonly<{
  directory: HerdrSessionDirectory;
  connectionFactory: HerdrSessionConnectionFactory;
  configuration: HerdrConfigurationSource;
  configurationActions: HerdrConfigurationActions;
  storage: PersistentKeyValueStorage;
  logger: HerdrLogger;
}>;

export class SessionsFeature {
  private readonly model: SessionsModel;
  private readonly view: VsCodeSessionsView;
  private readonly status: StatusFeature;
  private readonly commands: vscode.Disposable;
  private disposed = false;

  constructor(dependencies: SessionsFeatureDependencies) {
    this.model = new SessionsModel(
      dependencies.directory,
      dependencies.connectionFactory,
      dependencies.configuration,
      dependencies.storage,
      dependencies.logger,
    );
    let view: VsCodeSessionsView | undefined;
    let status: StatusFeature | undefined;
    try {
      view = new VsCodeSessionsView(this.model);
      status = new StatusFeature(this.model, this.model, dependencies.configurationActions, dependencies.logger);
      const registrations: vscode.Disposable[] = [];
      try {
        registrations.push(
          vscode.commands.registerCommand("herdr.selectSession", (id: unknown) =>
            typeof id === "string" ? this.model.selectSession(id) : undefined,
          ),
        );
        registrations.push(vscode.commands.registerCommand("herdr.refreshSessions", () => this.model.refresh()));
        this.commands = vscode.Disposable.from(...registrations);
      } catch (error) {
        vscode.Disposable.from(...registrations).dispose();
        throw error;
      }
      this.view = view;
      this.status = status;
    } catch (error) {
      status?.dispose();
      view?.dispose();
      this.model.dispose();
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.model.initialize();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.commands.dispose();
    this.status.dispose();
    this.view.dispose();
    this.model.dispose();
  }
}
