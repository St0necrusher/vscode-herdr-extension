import type { HerdrLogger } from "@capabilities/runtime";
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
} from "@capabilities/sessions";
import type {
  ActiveSessionState,
  PersistentKeyValueStorage,
  ReconnectingActiveSessionState,
  SessionsOperations,
  SessionsState,
  SessionsStateSource,
  StaleSessionProjection,
} from "./capabilities";

const selectedSessionKey = "herdr.selectedSession";
const reconnectDelays = [500, 1000, 2000, 5000, 10000, 30000] as const;

interface Disposable {
  dispose(): void;
}

interface RecoveryContext {
  readonly failure: Exclude<HerdrConnectionFailure, { kind: "incompatible" }>;
  readonly staleProjection?: StaleSessionProjection;
  readonly endpoint?: string;
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
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private selectedId: string | undefined;
  private persistence = Promise.resolve();
  private revision = 0;
  private generation = 0;
  private attempt = 0;
  private reconnectSequence = 0;
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
    this.attempt += 1;
    this.cancelReconnect();
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
    if (this.selectedId === session.id) {
      const active = this.state.active;
      if (active.kind === "reconnecting" || active.kind === "incompatible") {
        await this.restartRecovery(session, this.state.configuration, recoveryFromState(active));
      }
      return;
    }
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
    if (active.kind === "reconnecting" || active.kind === "incompatible") {
      await this.restartRecovery(active.session, this.state.configuration, recoveryFromState(active));
      return;
    }
    await this.refresh();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.revision += 1;
    this.generation += 1;
    this.attempt += 1;
    this.configurationSubscription?.dispose();
    this.configurationSubscription = undefined;
    this.cancelReconnect();
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
    this.attempt += 1;
    this.cancelReconnect();
    this.disposeConnection();
    this.selectedId = session.id;
    const persistence = persist ? this.persistSelection(session.id, generation) : Promise.resolve();
    try {
      if (session.availability === "stopped") {
        this.publishCurrent({ kind: "selected-stopped", session });
        return;
      }
      this.publishCurrent({ kind: "resolving", session });
      await this.runAttempt(session, configuration, generation, false);
    } finally {
      await persistence;
    }
  }

  private async restartRecovery(
    session: HerdrSessionDescriptor,
    configuration: HerdrConfiguration,
    previous: RecoveryContext,
  ): Promise<void> {
    const generation = ++this.generation;
    this.attempt += 1;
    this.cancelReconnect();
    this.disposeConnection();
    this.selectedId = session.id;
    this.reconnectSequence = 0;
    this.publishReconnecting(session, previous, { kind: "attempting" });
    await this.runAttempt(session, configuration, generation, true, previous);
  }

  private async runAttempt(
    session: HerdrSessionDescriptor,
    configuration: HerdrConfiguration,
    generation: number,
    reconnect: boolean,
    recovery?: RecoveryContext,
  ): Promise<void> {
    const attempt = ++this.attempt;
    if (reconnect && recovery === undefined) return;
    let connection: HerdrSessionConnection | undefined;
    let metadata: HerdrSessionMetadata | undefined;
    let snapshot: HerdrSessionSnapshot | undefined;
    let resolved: HerdrResolvedSession | undefined;
    if (reconnect) {
      if (recovery === undefined) return;
      this.publishReconnecting(session, recovery, { kind: "attempting" });
    }
    try {
      resolved = await this.directory.resolve(configuration, session.id);
      if (!this.isCurrentAttempt(generation, attempt)) return;
      if (reconnect) {
        if (recovery === undefined) return;
        this.publishReconnecting(
          session,
          { ...recovery, endpoint: resolved.endpoint },
          {
            kind: "attempting",
          },
        );
      } else {
        this.publishCurrent({ kind: "connecting", session, endpoint: resolved.endpoint });
      }
      connection = this.connectionFactory.create(resolved);
      this.connection = connection;
      const consumer = {
        replaceSnapshot: (next: HerdrSessionSnapshot): void => {
          if (!this.isCurrentAttempt(generation, attempt) || this.connection !== connection) return;
          snapshot = next;
          if (this.state.active.kind === "connected") this.publishCurrent({ ...this.state.active, snapshot: next });
        },
        connectionClosed: (failure: HerdrConnectionFailure): void => {
          if (!this.isCurrentAttempt(generation, attempt) || this.connection !== connection) return;
          const wasConnected = this.state.active.kind === "connected";
          this.connection = undefined;
          connection?.dispose();
          const staleProjection = retainStaleProjection(recovery?.staleProjection, metadata, snapshot);
          const context = {
            failure: failure.kind === "incompatible" ? transportFailure(failure.diagnostic) : failure,
            ...(staleProjection === undefined ? {} : { staleProjection }),
            ...(resolved?.endpoint === undefined ? {} : { endpoint: resolved.endpoint }),
          } satisfies RecoveryContext;
          if (failure.kind === "incompatible") {
            this.publishCurrent({
              kind: "incompatible",
              session,
              ...(resolved?.endpoint === undefined ? {} : { endpoint: resolved.endpoint }),
              ...(staleProjection === undefined ? {} : { staleProjection }),
              failure,
            });
          } else {
            this.beginRecovery(session, context, wasConnected, wasConnected);
          }
        },
      };
      metadata = await connection.bootstrap(consumer);
      if (!this.isCurrentAttempt(generation, attempt) || this.connection !== connection) {
        connection.dispose();
        return;
      }
      if (snapshot === undefined) throw new Error("Herdr connection completed without a Session snapshot.");
      this.cancelReconnect();
      this.publishCurrent({ kind: "connected", session, endpoint: resolved.endpoint, metadata, snapshot });
    } catch (error) {
      if (!this.isCurrentAttempt(generation, attempt)) {
        connection?.dispose();
        return;
      }
      if (this.connection === connection) this.connection = undefined;
      connection?.dispose();
      const failure = normalizeFailure(error);
      const staleProjection = retainStaleProjection(recovery?.staleProjection, metadata, snapshot);
      if (failure.kind === "incompatible") {
        this.publishCurrent({
          kind: "incompatible",
          session,
          ...((resolved?.endpoint ?? session.endpoint) ? { endpoint: resolved?.endpoint ?? session.endpoint } : {}),
          ...(staleProjection === undefined ? {} : { staleProjection }),
          failure,
        });
      } else {
        const context = {
          failure,
          ...(staleProjection === undefined ? {} : { staleProjection }),
          ...((resolved?.endpoint ?? session.endpoint) ? { endpoint: resolved?.endpoint ?? session.endpoint } : {}),
        } satisfies RecoveryContext;
        this.beginRecovery(session, context, false, !reconnect);
      }
    }
  }

  private beginRecovery(
    session: HerdrSessionDescriptor,
    context: RecoveryContext,
    immediate: boolean,
    reset: boolean,
  ): void {
    if (!this.isCurrentSession(session.id)) return;
    if (reset) this.reconnectSequence = 0;
    if (immediate) {
      this.publishReconnecting(session, context, { kind: "attempting" });
      void this.runAttempt(session, this.state.configuration, this.generation, true, context);
      return;
    }
    this.scheduleReconnect(session, context);
  }

  private scheduleReconnect(session: HerdrSessionDescriptor, context: RecoveryContext): void {
    if (!this.isCurrentSession(session.id)) return;
    this.cancelReconnectTimer();
    const baseDelay = reconnectDelays[Math.min(this.reconnectSequence, reconnectDelays.length - 1)] ?? 30000;
    this.reconnectSequence += 1;
    const delay = Math.round(baseDelay * (0.8 + Math.random() * 0.4));
    const retryAt = Date.now() + delay;
    this.publishReconnecting(session, context, { kind: "waiting", retryAt });
    const generation = this.generation;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.isCurrent(generation)) return;
      void this.runAttempt(session, this.state.configuration, generation, true, context);
    }, delay);
  }

  private publishReconnecting(
    session: HerdrSessionDescriptor,
    context: RecoveryContext,
    phase: ReconnectingActiveSessionState["phase"],
  ): void {
    this.publishCurrent({
      kind: "reconnecting",
      session,
      ...(context.endpoint === undefined ? {} : { endpoint: context.endpoint }),
      ...(context.staleProjection === undefined ? {} : { staleProjection: context.staleProjection }),
      failure: context.failure,
      phase,
    });
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

  private isCurrentAttempt(generation: number, attempt: number): boolean {
    return this.isCurrent(generation) && attempt === this.attempt;
  }

  private isCurrentSession(sessionId: string): boolean {
    return !this.disposed && this.selectedId === sessionId;
  }

  private isCurrentStart(revision: number, generation: number, sessionId: string): boolean {
    return this.isCurrentRevision(revision) && this.isCurrent(generation) && this.selectedId === sessionId;
  }

  private cancelReconnect(): void {
    this.cancelReconnectTimer();
    this.reconnectSequence = 0;
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private disposeConnection(): void {
    this.connection?.dispose();
    this.connection = undefined;
  }
}

function recoveryFromState(
  active: Extract<ActiveSessionState, { kind: "reconnecting" | "incompatible" }>,
): RecoveryContext {
  if (active.kind === "reconnecting") {
    return {
      failure: active.failure,
      ...(active.staleProjection === undefined ? {} : { staleProjection: active.staleProjection }),
      ...(active.endpoint === undefined ? {} : { endpoint: active.endpoint }),
    };
  }
  return {
    failure: transportFailure(active.failure.diagnostic),
    ...(active.staleProjection === undefined ? {} : { staleProjection: active.staleProjection }),
    ...(active.endpoint === undefined ? {} : { endpoint: active.endpoint }),
  };
}

function retainStaleProjection(
  previous: StaleSessionProjection | undefined,
  metadata: HerdrSessionMetadata | undefined,
  snapshot: HerdrSessionSnapshot | undefined,
): StaleSessionProjection | undefined {
  return metadata === undefined || snapshot === undefined ? previous : { metadata, snapshot };
}

function transportFailure(diagnostic: string): Exclude<HerdrConnectionFailure, { kind: "incompatible" }> {
  return { kind: "transport", diagnostic };
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
