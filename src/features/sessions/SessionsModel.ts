import type { HerdrLogger } from "#capabilities/runtime";
import type {
  HerdrConfiguration,
  HerdrConfigurationSource,
  HerdrConnectionFailure,
  HerdrResolvedSession,
  HerdrSessionConnection,
  HerdrSessionConnectionFactory,
  HerdrSessionDescriptor,
  HerdrSessionDirectory,
  HerdrSessionMetadata,
  HerdrSessionSnapshot,
} from "#capabilities/sessions";
import type {
  ActiveSessionState,
  PersistentKeyValueStorage,
  SessionsOperations,
  SessionsState,
  SessionsStateSource,
} from "./capabilities/index.js";

const selectedSessionKey = "herdr.selectedSession";

interface Disposable {
  dispose(): void;
}

export class SessionsModel implements SessionsStateSource, SessionsOperations {
  private readonly listeners = new Set<(state: SessionsState) => void>();
  private readonly directory: HerdrSessionDirectory;
  private readonly connectionFactory: HerdrSessionConnectionFactory;
  private readonly configuration: HerdrConfigurationSource;
  private readonly storage: PersistentKeyValueStorage;
  private readonly logger: HerdrLogger;
  private state: SessionsState;
  private configurationSubscription: Disposable | undefined;
  private connection: HerdrSessionConnection | undefined;
  private selectedId: string | undefined;
  private persistence = Promise.resolve();
  private revision = 0;
  private generation = 0;
  private disposed = false;

  constructor(
    directory: HerdrSessionDirectory,
    connectionFactory: HerdrSessionConnectionFactory,
    configuration: HerdrConfigurationSource,
    storage: PersistentKeyValueStorage,
    logger: HerdrLogger,
  ) {
    this.directory = directory;
    this.connectionFactory = connectionFactory;
    this.configuration = configuration;
    this.storage = storage;
    this.logger = logger;
    this.state = { configuration: configuration.read(), catalog: { kind: "checking" }, active: { kind: "unselected" } };
  }

  async initialize(): Promise<void> {
    if (this.disposed) return;
    this.configurationSubscription = this.configuration.onDidChange(() => {
      void this.refresh();
    });
    await this.refresh();
  }

  getState(): SessionsState {
    return this.state;
  }

  onDidChange(listener: (state: SessionsState) => void): Disposable {
    if (this.disposed) return { dispose: () => undefined };
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    const configuration = this.configuration.read();
    const requestRevision = ++this.revision;
    this.generation += 1;
    this.disposeConnection();
    this.selectedId = undefined;
    this.publish({ configuration, catalog: { kind: "checking" }, active: { kind: "unselected" } });
    this.logger.info(`Discovering Herdr Session "${configuration.session}" with ${configuration.executable}.`);
    try {
      const result = await this.directory.list(configuration);
      if (!this.isCurrentRevision(requestRevision)) return;
      switch (result.kind) {
        case "success":
          this.publish({
            configuration,
            catalog: { kind: "ready", sessions: result.sessions },
            active: { kind: "unselected" },
          });
          await this.reconcileSelection(configuration, result.sessions, requestRevision);
          break;
        case "missing-executable":
          this.publish({ configuration, catalog: { kind: "missing-executable" }, active: { kind: "unselected" } });
          break;
        case "failure":
          this.publish({
            configuration,
            catalog: { kind: "error", diagnostic: result.diagnostic },
            active: { kind: "unselected" },
          });
          break;
      }
      this.logger.info(`Herdr Session list result: ${result.kind}.`);
    } catch (error) {
      if (!this.isCurrentRevision(requestRevision)) return;
      const diagnostic = error instanceof Error ? error.message : String(error);
      this.publish({ configuration, catalog: { kind: "error", diagnostic }, active: { kind: "unselected" } });
      this.logger.error("Herdr Session discovery failed.", error);
    }
  }

  async selectSession(sessionId: string): Promise<void> {
    if (this.disposed || this.state.catalog.kind !== "ready") return;
    const session = this.state.catalog.sessions.find((candidate) => candidate.id === sessionId);
    if (session === undefined) return;
    if (this.selectedId === session.id && !needsRetry(this.state.active, session)) return;
    await this.activate(session, this.state.configuration, true);
  }

  async startSelectedSession(): Promise<void> {
    if (this.disposed || this.state.catalog.kind !== "ready" || this.selectedId === undefined) return;
    const session = this.state.catalog.sessions.find((candidate) => candidate.id === this.selectedId);
    if (session?.availability !== "stopped") return;
    const revision = this.revision;
    const generation = this.generation;
    const sessionId = session.id;
    try {
      await this.directory.start(this.state.configuration, sessionId);
      if (this.isCurrentStart(revision, generation, sessionId)) await this.refresh();
    } catch (error) {
      if (!this.isCurrentStart(revision, generation, sessionId)) return;
      const diagnostic = error instanceof Error ? error.message : String(error);
      this.publish({
        configuration: this.state.configuration,
        catalog: this.state.catalog,
        active: { kind: "start-failed", session, diagnostic },
      });
      this.logger.error(`Failed to start Herdr Session "${session.id}".`, error);
    }
  }

  async retry(): Promise<void> {
    if (this.disposed) return;
    if (this.state.catalog.kind !== "ready") {
      await this.refresh();
      return;
    }
    const active = this.state.active;
    if (active.kind === "disconnected" || active.kind === "incompatible") {
      await this.activate(active.session, this.state.configuration, false);
      return;
    }
    await this.refresh();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.revision += 1;
    this.generation += 1;
    this.configurationSubscription?.dispose();
    this.configurationSubscription = undefined;
    this.disposeConnection();
    this.listeners.clear();
  }

  private async reconcileSelection(
    configuration: HerdrConfiguration,
    sessions: readonly HerdrSessionDescriptor[],
    revision: number,
  ): Promise<void> {
    if (!this.isCurrentRevision(revision) || sessions.length === 0) return;
    const selected = this.resolveInitialSelection(sessions, configuration.session);
    if (selected === undefined) return;
    await this.activate(selected.session, configuration, selected.persist);
  }

  private resolveInitialSelection(
    sessions: readonly HerdrSessionDescriptor[],
    configuredSession: string,
  ): Readonly<{ session: HerdrSessionDescriptor; persist: boolean }> | undefined {
    let saved: string | undefined;
    try {
      const value = this.storage.get(selectedSessionKey);
      saved = typeof value === "string" && value.length > 0 ? value : undefined;
    } catch (error) {
      this.logger.error("Failed to read the saved Herdr Session selection.", error);
    }
    const persisted = saved === undefined ? undefined : sessions.find((session) => session.id === saved);
    const configured = sessions.find((session) => session.id === configuredSession);
    const defaultSession =
      sessions.find((session) => session.isDefault) ?? sessions.find((session) => session.id === "default");
    const selected = persisted ?? configured ?? defaultSession;
    if (selected === undefined) return undefined;
    if (selected.id !== saved) {
      this.logger.info(
        `${saved === undefined ? "No saved selection was available" : `Saved Session "${saved}" is unavailable`}; selecting Herdr Session "${selected.id}".`,
      );
    }
    return { session: selected, persist: selected.id !== saved };
  }

  private async activate(
    session: HerdrSessionDescriptor,
    configuration: HerdrConfiguration,
    persist: boolean,
  ): Promise<void> {
    const generation = ++this.generation;
    this.disposeConnection();
    this.selectedId = session.id;
    const persistence = persist ? this.persistSelection(session.id, generation) : Promise.resolve();
    try {
      if (session.availability === "stopped") {
        this.publishCurrent({ kind: "selected-stopped", session });
        return;
      }
      this.publishCurrent({ kind: "resolving", session });
      let connection: HerdrSessionConnection | undefined;
      let metadata: HerdrSessionMetadata | undefined;
      let snapshot: HerdrSessionSnapshot | undefined;
      let resolved: HerdrResolvedSession | undefined;
      try {
        resolved = await this.directory.resolve(configuration, session.id);
        if (!this.isCurrent(generation)) return;
        this.publishCurrent({ kind: "connecting", session, endpoint: resolved.endpoint });
        connection = this.connectionFactory.create(resolved);
        this.connection = connection;
        const consumer = {
          replaceSnapshot: (next: HerdrSessionSnapshot): void => {
            if (!this.isCurrent(generation) || this.connection !== connection) return;
            snapshot = next;
            if (this.state.active.kind === "connected") this.publishCurrent({ ...this.state.active, snapshot: next });
          },
          connectionClosed: (failure: HerdrConnectionFailure): void => {
            if (!this.isCurrent(generation) || this.connection !== connection) return;
            this.connection = undefined;
            this.generation += 1;
            this.publishCurrent(
              failure.kind === "incompatible"
                ? {
                    kind: "incompatible",
                    session,
                    ...(resolved?.endpoint === undefined ? {} : { endpoint: resolved.endpoint }),
                    failure,
                  }
                : {
                    kind: "disconnected",
                    session,
                    ...(resolved?.endpoint === undefined ? {} : { endpoint: resolved.endpoint }),
                    ...(metadata === undefined ? {} : { metadata }),
                    failure,
                  },
            );
          },
        };
        metadata = await connection.bootstrap(consumer);
        if (!this.isCurrent(generation) || this.connection !== connection) {
          connection.dispose();
          return;
        }
        if (snapshot === undefined) throw new Error("Herdr connection completed without a Session snapshot.");
        this.publishCurrent({ kind: "connected", session, endpoint: resolved.endpoint, metadata, snapshot });
      } catch (error) {
        if (!this.isCurrent(generation)) {
          connection?.dispose();
          return;
        }
        if (this.connection === connection) this.connection = undefined;
        connection?.dispose();
        const failure = normalizeFailure(error);
        this.publishCurrent(
          failure.kind === "incompatible"
            ? {
                kind: "incompatible",
                session,
                ...((resolved?.endpoint ?? session.endpoint)
                  ? { endpoint: resolved?.endpoint ?? session.endpoint }
                  : {}),
                failure,
              }
            : {
                kind: "disconnected",
                session,
                ...((resolved?.endpoint ?? session.endpoint)
                  ? { endpoint: resolved?.endpoint ?? session.endpoint }
                  : {}),
                ...(metadata === undefined ? {} : { metadata }),
                failure,
              },
        );
      }
    } finally {
      await persistence;
    }
  }

  private persistSelection(sessionId: string, generation: number): Promise<void> {
    const task = this.persistence.then(async () => {
      try {
        await this.storage.update(selectedSessionKey, sessionId);
      } catch (error) {
        if (this.isCurrent(generation))
          this.logger.error(`Failed to persist Herdr Session selection "${sessionId}".`, error);
      }
    });
    this.persistence = task;
    return task;
  }

  private publishCurrent(active: ActiveSessionState): void {
    this.publish({ ...this.state, active });
  }

  private publish(state: SessionsState): void {
    if (this.disposed) return;
    this.state = state;
    for (const listener of [...this.listeners]) {
      try {
        listener(state);
      } catch (error) {
        this.logger.error("A Sessions observer failed.", error);
      }
    }
  }

  private isCurrentRevision(revision: number): boolean {
    return !this.disposed && revision === this.revision;
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private isCurrentStart(revision: number, generation: number, sessionId: string): boolean {
    return this.isCurrentRevision(revision) && this.isCurrent(generation) && this.selectedId === sessionId;
  }

  private disposeConnection(): void {
    this.connection?.dispose();
    this.connection = undefined;
  }
}

function needsRetry(active: ActiveSessionState, session: HerdrSessionDescriptor): boolean {
  return (active.kind === "disconnected" || active.kind === "incompatible") && active.session.id === session.id;
}

function normalizeFailure(error: unknown): HerdrConnectionFailure {
  if (error instanceof Error && "failure" in error && isFailure((error as { failure?: unknown }).failure)) {
    return (error as Error & { failure: HerdrConnectionFailure }).failure;
  }
  return { kind: "transport", diagnostic: error instanceof Error ? error.message : String(error) };
}

function isFailure(value: unknown): value is HerdrConnectionFailure {
  return (
    isRecord(value) &&
    typeof value.kind === "string" &&
    ["transport", "herdr-error", "incompatible", "invalid-response"].includes(value.kind)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
