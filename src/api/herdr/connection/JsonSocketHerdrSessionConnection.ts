import { HerdrConnectionFailureError } from "../shared";
import type {
  CreatedPane,
  CreatedSpace,
  HerdrConnectionFailure,
  HerdrPaneMovedEvent,
  HerdrResolvedSession,
  HerdrSessionMetadata,
  HerdrSessionSnapshot,
  SplitDirection,
} from "../shared";
import type { HerdrSessionConnection, HerdrSessionProjectionConsumer } from "./connection";
import type { Logger } from "@core/logger";
import {
  invalidResponse,
  parsePaneInfoResult,
  parsePaneMovedPayload,
  parsePongResult,
  parseTabCreatedResult,
  parseWorkspaceCreatedResult,
  requireResultType,
  type HerdrProtocolRecord,
  parseHerdrPane,
  parseSnapshotResult,
  subscriptionsForPanes,
  validateEventMessage,
} from "./protocol";
import type { HerdrSocketConnector, HerdrSocketTransport } from "./NodeHerdrSocketConnector";
import { asFailure, JsonSocketClient } from "./JsonSocketClient";

const reconciliationDebounceMs = 50;

export class JsonSocketHerdrSessionConnection implements HerdrSessionConnection {
  private readonly session: HerdrResolvedSession;
  private readonly connector: HerdrSocketConnector;
  private readonly logger: Logger;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly clients = new Set<JsonSocketClient>();
  private readonly pendingConnections = new Set<AbortController>();
  private consumer: HerdrSessionProjectionConsumer | undefined;
  private subscription: JsonSocketClient | undefined;
  private subscriptionPaneIds: readonly string[] = [];
  private latestSnapshot: HerdrSessionSnapshot | undefined;
  private reconciliation: Promise<void> | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private failure: HerdrConnectionFailure | undefined;
  private metadata: HerdrSessionMetadata | undefined;
  private ready = false;
  private disposed = false;

  constructor(
    session: HerdrResolvedSession,
    connector: HerdrSocketConnector,
    logger: Logger,
    requestTimeoutMs: number,
    connectTimeoutMs: number,
  ) {
    this.session = session;
    this.connector = connector;
    this.logger = logger;
    this.requestTimeoutMs = requestTimeoutMs;
    this.connectTimeoutMs = connectTimeoutMs;
  }

  async bootstrap(consumer: HerdrSessionProjectionConsumer): Promise<HerdrSessionMetadata> {
    if (this.disposed) throw new Error("Herdr Session connection is disposed.");
    if (this.consumer !== undefined) throw new Error("Herdr Session connection was already bootstrapped.");
    this.consumer = consumer;

    try {
      const metadata = parsePongResult(
        await this.requestOnce("ping", {}).catch((error: unknown) => {
          throw asFailure(error, "ping");
        }),
      );
      this.metadata = metadata;
      this.subscription = await this.openSubscription([]);
      this.subscriptionPaneIds = [];
      this.ensureBootstrapActive();
      this.dirty = true;
      await this.reconcileSnapshots();
      this.ensureBootstrapActive();
      if (this.latestSnapshot === undefined)
        throw invalidResponse("Herdr bootstrap did not produce a Session snapshot.");

      this.ready = true;
      return metadata;
    } catch (error) {
      const failure =
        this.failure === undefined ? asFailure(error, "snapshot") : new HerdrConnectionFailureError(this.failure);
      this.failure = failure.failure;
      this.dispose();
      throw failure;
    }
  }

  async createSpace(cwd: string): Promise<CreatedSpace> {
    const result = parseWorkspaceCreatedResult(await this.requestOnce("workspace.create", { cwd, focus: false }));
    await this.publishSnapshotAfterMutation();
    return result;
  }

  async createPane(spaceId: string, options: Readonly<{ cwd?: string; label?: string }> = {}): Promise<CreatedPane> {
    const result = parseTabCreatedResult(
      await this.requestOnce("tab.create", { workspace_id: spaceId, focus: false, ...options }),
    );
    await this.publishSnapshotAfterMutation();
    return result;
  }

  async splitPane(paneId: string, direction: SplitDirection): Promise<CreatedPane> {
    const result = parsePaneInfoResult(
      await this.requestOnce("pane.split", { target_pane_id: paneId, direction, focus: false }),
    );
    await this.publishSnapshotAfterMutation();
    return result;
  }

  // Sends what `herdr pane run` sends; the command changes no structure, so no snapshot is awaited.
  async runCommand(paneId: string, command: string): Promise<void> {
    requireResultType(
      await this.requestOnce("pane.send_input", { pane_id: paneId, text: command, keys: ["Enter"] }),
      "ok",
    );
  }

  async renamePane(paneId: string, label: string | null): Promise<void> {
    await this.mutate("pane.rename", { pane_id: paneId, label }, "pane_info");
  }

  async renameTab(tabId: string, label: string): Promise<void> {
    await this.mutate("tab.rename", { tab_id: tabId, label }, "tab_info");
  }

  async moveTab(tabId: string, insertIndex: number): Promise<void> {
    await this.mutate("tab.move", { tab_id: tabId, insert_index: insertIndex }, "tab_list");
  }

  async renameSpace(spaceId: string, label: string): Promise<void> {
    await this.mutate("workspace.rename", { workspace_id: spaceId, label }, "workspace_info");
  }

  async closePane(paneId: string): Promise<void> {
    await this.mutate("pane.close", { pane_id: paneId }, "ok");
  }

  async closeTab(tabId: string): Promise<void> {
    await this.mutate("tab.close", { tab_id: tabId }, "ok");
  }

  async closeSpace(spaceId: string, closeGroup: boolean): Promise<void> {
    await this.mutate("workspace.close", { workspace_id: spaceId, close_group: closeGroup }, "ok");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
    this.dirty = false;
    this.consumer = undefined;
    this.subscription = undefined;
    this.subscriptionPaneIds = [];
    for (const controller of this.pendingConnections) {
      controller.abort(new Error("Herdr Session connection was disposed."));
    }
    this.pendingConnections.clear();
    for (const client of this.clients) client.dispose();
    this.clients.clear();
  }

  private async requestOnce(
    method:
      | "ping"
      | "session.snapshot"
      | "workspace.create"
      | "tab.create"
      | "pane.split"
      | "pane.send_input"
      | "pane.rename"
      | "tab.rename"
      | "tab.move"
      | "workspace.rename"
      | "pane.close"
      | "tab.close"
      | "workspace.close",
    params: Readonly<Record<string, unknown>>,
  ): Promise<HerdrProtocolRecord> {
    let client: JsonSocketClient | undefined;
    try {
      client = await this.createClient(
        () => undefined,
        () => undefined,
      );
      return await client.request(method, params);
    } finally {
      if (client !== undefined) this.removeClient(client);
    }
  }

  private async openSubscription(paneIdsToSubscribe: readonly string[]): Promise<JsonSocketClient> {
    let client: JsonSocketClient | undefined;
    try {
      client = await this.createClient(
        (message) => this.handleEvent(message),
        (error) => this.failConnection(error, "subscribe"),
      );
      const result = await client.request("events.subscribe", {
        subscriptions: subscriptionsForPanes(paneIdsToSubscribe),
      });
      requireResultType(result, "subscription_started");
      return client;
    } catch (error) {
      if (client !== undefined) this.removeClient(client);
      throw asFailure(error, "subscribe");
    }
  }

  private async createClient(
    onEvent: (message: HerdrProtocolRecord) => void,
    onFailure: (error: unknown) => void,
  ): Promise<JsonSocketClient> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error("Herdr socket connection timed out."));
    }, this.connectTimeoutMs);
    this.pendingConnections.add(controller);
    let transport: HerdrSocketTransport;
    try {
      transport = await this.connector.connect(this.session.endpoint, controller.signal);
    } finally {
      clearTimeout(timer);
      this.pendingConnections.delete(controller);
    }
    if (this.disposed) {
      transport.dispose();
      throw new Error("Herdr Session connection is disposed.");
    }
    const client = new JsonSocketClient(transport, this.logger, onEvent, onFailure, this.requestTimeoutMs);
    this.clients.add(client);
    return client;
  }

  private async reconcileSnapshots(): Promise<void> {
    if (this.reconciliation !== undefined) return await this.reconciliation;
    const task = this.runReconciliation();
    this.reconciliation = task;
    try {
      await task;
    } finally {
      if (this.reconciliation === task) this.reconciliation = undefined;
    }
  }

  private async runReconciliation(): Promise<void> {
    while (!this.disposed && this.dirty) {
      this.dirty = false;
      const result = await this.requestOnce("session.snapshot", {}).catch((error: unknown) => {
        throw asFailure(error, "snapshot");
      });
      if (this.metadata === undefined) throw invalidResponse("Herdr snapshot arrived before ping metadata.");
      const snapshot = parseSnapshotResult(result, this.metadata);
      this.latestSnapshot = snapshot;
      this.notifySnapshot(snapshot);
      if (await this.synchronizeSubscriptions(paneIds(snapshot))) {
        this.dirty = true;
      }
    }
  }

  private async mutate(
    method:
      "pane.rename" | "tab.rename" | "tab.move" | "workspace.rename" | "pane.close" | "tab.close" | "workspace.close",
    params: Readonly<Record<string, unknown>>,
    resultType: "ok" | "pane_info" | "tab_info" | "tab_list" | "workspace_info",
  ): Promise<void> {
    requireResultType(await this.requestOnce(method, params), resultType);
    await this.publishSnapshotAfterMutation();
  }

  private async publishSnapshotAfterMutation(): Promise<void> {
    try {
      this.dirty = true;
      const shouldReconcileAgain = (): boolean => this.dirty && !this.disposed;
      do {
        await this.reconcileSnapshots();
      } while (shouldReconcileAgain());
      if (this.disposed) throw new Error("Herdr Session connection is disposed.");
    } catch (error) {
      this.failConnection(error, "snapshot");
      throw error;
    }
  }

  private notifySnapshot(snapshot: HerdrSessionSnapshot): void {
    try {
      this.consumer?.replaceSnapshot(snapshot);
    } catch (error) {
      this.logger.error("A Herdr Session projection observer failed.", error);
    }
  }

  private handleEvent(message: HerdrProtocolRecord): void {
    if (this.disposed) return;
    try {
      if (!validateEventMessage(message)) return;
      const paneMoved = parsePaneMovedPayload(message);
      if (paneMoved !== undefined) {
        const event: HerdrPaneMovedEvent = {
          sessionId: this.session.id,
          previousPaneId: paneMoved.previousPaneId,
          currentPane: parseHerdrPane(paneMoved.pane),
        };
        this.consumer?.paneMoved?.(event);
      }
      this.dirty = true;
      if (this.ready && this.reconciliation === undefined && this.debounceTimer === undefined) {
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = undefined;
          void this.reconcileSnapshots().catch((error: unknown) => this.failConnection(error, "snapshot"));
        }, reconciliationDebounceMs);
      }
    } catch (error) {
      this.failConnection(error, "subscribe");
    }
  }

  private async synchronizeSubscriptions(targetPaneIds: readonly string[]): Promise<boolean> {
    if (this.disposed || sameIds(this.subscriptionPaneIds, targetPaneIds)) return false;
    const replacement = await this.openSubscription(targetPaneIds);
    if (this.isDisposed()) {
      replacement.dispose();
      this.clients.delete(replacement);
      return false;
    }
    const previous = this.subscription;
    this.subscription = replacement;
    this.subscriptionPaneIds = targetPaneIds;
    if (previous !== undefined) this.removeClient(previous);
    return true;
  }

  private failConnection(error: unknown, operation: "ping" | "subscribe" | "snapshot"): void {
    if (this.disposed || this.failure !== undefined) return;
    const failure = asFailure(error, operation).failure;
    this.failure = failure;
    const consumer = this.consumer;
    if (!this.ready) {
      this.dispose();
      return;
    }
    this.ready = false;
    try {
      consumer?.connectionClosed(failure);
    } catch (observerError) {
      this.logger.error("A Herdr Session connection observer failed.", observerError);
    } finally {
      this.dispose();
    }
  }

  private ensureBootstrapActive(): void {
    if (!this.disposed) return;
    if (this.failure !== undefined) throw new HerdrConnectionFailureError(this.failure);
    throw new Error("Herdr Session connection is disposed.");
  }

  private isDisposed(): boolean {
    return this.disposed;
  }

  private removeClient(client: JsonSocketClient): void {
    this.clients.delete(client);
    client.dispose();
  }
}

function paneIds(snapshot: HerdrSessionSnapshot): readonly string[] {
  return [...new Set(snapshot.panes.map((pane) => pane.id))].sort();
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
