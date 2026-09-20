import { describe, expect, it, vi } from "vitest";
import type { HerdrSessionConnection, HerdrSessionProjectionConsumer } from "../../../src/capabilities/sessions";
import { JsonSocketHerdrSessionConnectionFactory } from "../../../src/infrastructure/herdr/socket/JsonSocketHerdrSessionConnectionFactory";
import type {
  HerdrSocketConnector,
  HerdrSocketTransport,
} from "../../../src/infrastructure/herdr/socket/NodeHerdrSocketConnector";

type Request = Readonly<{
  id: string;
  method: string;
  params: Readonly<Record<string, unknown>>;
}>;

class ControlledTransport implements HerdrSocketTransport {
  disposed = false;
  private readonly dataListeners = new Set<(data: Uint8Array) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private readonly closeListeners = new Set<() => void>();

  constructor(private readonly onWrite: (transport: ControlledTransport, request: Request) => void) {}

  write(data: string): void {
    for (const line of data.split("\n")) {
      if (line.length === 0) continue;
      const value: unknown = JSON.parse(line);
      if (!isRecord(value) || typeof value.id !== "string" || typeof value.method !== "string") {
        throw new Error("Test server received an invalid request.");
      }
      this.onWrite(this, {
        id: value.id,
        method: value.method,
        params: isRecord(value.params) ? value.params : {},
      });
    }
  }

  onData(listener: (data: Uint8Array) => void): { dispose(): void } {
    this.dataListeners.add(listener);
    return { dispose: () => this.dataListeners.delete(listener) };
  }

  onError(listener: (error: Error) => void): { dispose(): void } {
    this.errorListeners.add(listener);
    return { dispose: () => this.errorListeners.delete(listener) };
  }

  onClose(listener: () => void): { dispose(): void } {
    this.closeListeners.add(listener);
    return { dispose: () => this.closeListeners.delete(listener) };
  }

  dispose(): void {
    this.disposed = true;
    this.dataListeners.clear();
    this.errorListeners.clear();
    this.closeListeners.clear();
  }

  respond(request: Request, result: Record<string, unknown>): void {
    this.emit({ id: request.id, result });
  }

  emit(value: Record<string, unknown>, chunks = 1): void {
    const encoded = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
    const chunkSize = Math.max(1, Math.ceil(encoded.length / chunks));
    for (let offset = 0; offset < encoded.length; offset += chunkSize) {
      const chunk = encoded.subarray(offset, Math.min(offset + chunkSize, encoded.length));
      for (const listener of [...this.dataListeners]) listener(chunk);
    }
  }

  emitEvent(event: string): void {
    this.emit({ event, data: { changed: true, unknown_field: "ignored" } });
  }
}

class ControlledConnector implements HerdrSocketConnector {
  readonly transports: ControlledTransport[] = [];
  readonly requests: { transport: ControlledTransport; request: Request }[] = [];

  constructor(private readonly onRequest: (transport: ControlledTransport, request: Request) => void) {}

  connect(_endpoint: string, signal: AbortSignal): Promise<HerdrSocketTransport> {
    if (signal.aborted) return Promise.reject(abortReason(signal));
    const transport = new ControlledTransport((current, request) => {
      this.requests.push({ transport: current, request });
      this.onRequest(current, request);
    });
    this.transports.push(transport);
    return Promise.resolve(transport);
  }
}

class SignalConnector implements HerdrSocketConnector {
  signal: AbortSignal | undefined;
  private resolveTransport: ((transport: HerdrSocketTransport) => void) | undefined;
  private readonly rejectOnAbort: boolean;

  constructor(rejectOnAbort: boolean) {
    this.rejectOnAbort = rejectOnAbort;
  }

  connect(_endpoint: string, signal: AbortSignal): Promise<HerdrSocketTransport> {
    this.signal = signal;
    return new Promise<HerdrSocketTransport>((resolve, reject) => {
      this.resolveTransport = resolve;
      if (signal.aborted && this.rejectOnAbort) {
        reject(abortReason(signal));
        return;
      }
      if (this.rejectOnAbort) {
        signal.addEventListener("abort", () => reject(abortReason(signal)), { once: true });
      }
    });
  }

  resolve(transport: HerdrSocketTransport): void {
    this.resolveTransport?.(transport);
  }
}

const logger = { info: vi.fn(), error: vi.fn(), show: vi.fn() };
const consumer = (): HerdrSessionProjectionConsumer => ({
  replaceSnapshot: vi.fn(),
  connectionClosed: vi.fn(),
});

function connection(connector: HerdrSocketConnector): HerdrSessionConnection {
  return new JsonSocketHerdrSessionConnectionFactory(logger, connector, 1_000, 50).create({
    id: "default",
    endpoint: "/tmp/herdr.sock",
  });
}

function pong(): Record<string, unknown> {
  return {
    type: "pong",
    version: "0.9.1",
    protocol: 22,
    capabilities: { endpoint_protocol_generation: 1, unknown_capability: true },
    unknown_field: "ignored",
  };
}

function snapshotResult(paneIds: readonly string[] = []): Record<string, unknown> {
  const hasPanes = paneIds.length > 0;
  return {
    type: "session_snapshot",
    snapshot: {
      version: "0.9.1",
      protocol: 22,
      workspaces: hasPanes
        ? [
            {
              workspace_id: "space-1",
              number: 1,
              label: "Space",
              focused: true,
              pane_count: paneIds.length,
              tab_count: 1,
              active_tab_id: "tab-1",
              agent_status: "idle",
            },
          ]
        : [],
      tabs: hasPanes
        ? [
            {
              tab_id: "tab-1",
              workspace_id: "space-1",
              number: 1,
              label: "Tab",
              focused: true,
              pane_count: paneIds.length,
              agent_status: "idle",
            },
          ]
        : [],
      panes: paneIds.map((paneId, index) => ({
        pane_id: paneId,
        terminal_id: `terminal-${paneId}`,
        workspace_id: "space-1",
        tab_id: "tab-1",
        focused: index === 0,
        agent_status: "idle",
        revision: index,
      })),
      layouts: [],
      agents: [],
      unknown_snapshot_field: "ignored",
    },
  };
}

function subscribeAck(): Record<string, unknown> {
  return { type: "subscription_started", unknown_ack_field: "ignored" };
}

async function waitFor<T>(read: () => T, assertion: (value: T) => void): Promise<void> {
  await vi.waitFor(() => assertion(read()), { timeout: 1_000, interval: 1 });
}

describe("JSON Socket Herdr Session connection", () => {
  it("bootstraps in protocol order, returns metadata, and closes transports without late projection events", async () => {
    const order: string[] = [];
    const connector = new ControlledConnector((transport, request) => {
      order.push(request.method);
      if (request.method === "ping") transport.respond(request, pong());
      if (request.method === "events.subscribe") transport.respond(request, subscribeAck());
      if (request.method === "session.snapshot") transport.respond(request, snapshotResult());
    });
    const replaceSnapshot = vi.fn();
    const connectionClosed = vi.fn();
    const projectionConsumer: HerdrSessionProjectionConsumer = { replaceSnapshot, connectionClosed };
    const sessionConnection = connection(connector);

    const metadata = await sessionConnection.bootstrap(projectionConsumer);

    expect(order).toEqual(["ping", "events.subscribe", "session.snapshot"]);
    expect(metadata).toMatchObject({ version: "0.9.1", protocol: 22, endpointProtocolGeneration: 1 });
    expect(metadata.capabilities).toEqual({});
    expect(replaceSnapshot).toHaveBeenCalledTimes(1);

    const transports = [...connector.transports];
    sessionConnection.dispose();
    expect(transports.every((transport) => transport.disposed)).toBe(true);
    const replacements = replaceSnapshot.mock.calls.length;
    const subscriptionTransport = connector.transports[1];
    if (subscriptionTransport === undefined) throw new Error("The retained subscription transport was not created.");
    subscriptionTransport.emitEvent("workspace.updated");
    expect(replaceSnapshot).toHaveBeenCalledTimes(replacements);
    expect(connectionClosed).not.toHaveBeenCalled();
  });

  it("ignores unknown response IDs and preserves structured Herdr errors for the actual request", async () => {
    const connector = new ControlledConnector((transport, request) => {
      if (request.method === "ping") {
        transport.emit({ id: "unknown-response", result: pong() });
        transport.respond(request, pong());
      }
      if (request.method === "events.subscribe") transport.respond(request, subscribeAck());
      if (request.method === "session.snapshot") {
        transport.emit({ id: "unknown-response", result: snapshotResult() });
        transport.emit({
          id: request.id,
          error: { code: "SNAPSHOT_FAILED", message: "snapshot unavailable", unknown_field: true },
        });
      }
    });

    await expect(connection(connector).bootstrap(consumer())).rejects.toMatchObject({
      failure: { kind: "herdr-error", code: "SNAPSHOT_FAILED", message: "snapshot unavailable", operation: "snapshot" },
    });
  });

  it("bounds a pending socket connect by timeout", async () => {
    vi.useFakeTimers();
    try {
      const connector = new SignalConnector(true);
      const pending = connection(connector).bootstrap(consumer());
      const rejection = expect(pending).rejects.toMatchObject({
        failure: { kind: "transport" },
      });

      await vi.advanceTimersByTimeAsync(51);

      await rejection;
      expect(connector.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels pending connects and disposes a transport that resolves late", async () => {
    const connector = new SignalConnector(false);
    const sessionConnection = connection(connector);
    const pending = sessionConnection.bootstrap(consumer());

    await waitFor(
      () => connector.signal,
      (signal) => expect(signal).toBeDefined(),
    );
    sessionConnection.dispose();
    expect(connector.signal?.aborted).toBe(true);

    const lateTransport = new ControlledTransport(() => undefined);
    connector.resolve(lateTransport);

    await expect(pending).rejects.toThrow("disposed");
    expect(lateTransport.disposed).toBe(true);
  });

  it("serializes live reconciliation and runs another pass for invalidation during a snapshot", async () => {
    let firstSnapshot: { transport: ControlledTransport; request: Request } | undefined;
    let secondSnapshot: { transport: ControlledTransport; request: Request } | undefined;
    let snapshotInFlight = 0;
    let maximumSnapshotInFlight = 0;
    const connector = new ControlledConnector((transport, request) => {
      if (request.method === "ping") transport.respond(request, pong());
      if (request.method === "events.subscribe") transport.respond(request, subscribeAck());
      if (request.method === "session.snapshot") {
        snapshotInFlight += 1;
        maximumSnapshotInFlight = Math.max(maximumSnapshotInFlight, snapshotInFlight);
        if (firstSnapshot === undefined) firstSnapshot = { transport, request };
        else secondSnapshot = { transport, request };
      }
    });
    const replaceSnapshot = vi.fn();
    const projectionConsumer: HerdrSessionProjectionConsumer = {
      replaceSnapshot,
      connectionClosed: vi.fn(),
    };
    const sessionConnection = connection(connector);
    const bootstrap = sessionConnection.bootstrap(projectionConsumer);

    await waitFor(
      () => firstSnapshot,
      (request) => expect(request).toBeDefined(),
    );
    firstSnapshot?.transport.respond(firstSnapshot.request, snapshotResult());
    snapshotInFlight -= 1;
    await bootstrap;

    const subscription = connector.transports[1];
    if (subscription === undefined) throw new Error("The subscription transport was not created.");
    subscription.emitEvent("workspace.updated");
    await waitFor(
      () => secondSnapshot,
      (request) => expect(request).toBeDefined(),
    );

    subscription.emitEvent("pane.updated");
    expect(connector.requests.filter(({ request }) => request.method === "session.snapshot")).toHaveLength(2);
    expect(maximumSnapshotInFlight).toBe(1);

    secondSnapshot?.transport.respond(secondSnapshot.request, snapshotResult());
    snapshotInFlight -= 1;
    await waitFor(
      () => connector.requests.filter(({ request }) => request.method === "session.snapshot").length,
      (snapshotRequests) => expect(snapshotRequests).toBe(3),
    );
    expect(maximumSnapshotInFlight).toBe(1);

    const thirdSnapshot = connector.requests.filter(({ request }) => request.method === "session.snapshot").at(-1);
    if (thirdSnapshot === undefined) throw new Error("The follow-up snapshot request was not created.");
    thirdSnapshot.transport.respond(thirdSnapshot.request, snapshotResult());
    snapshotInFlight -= 1;
    await waitFor(
      () => replaceSnapshot.mock.calls.length,
      (replacements) => expect(replacements).toBe(3),
    );
    expect(snapshotInFlight).toBe(0);
    sessionConnection.dispose();
  });

  it("keeps the old pane subscription until replacement acknowledgement, then stabilizes", async () => {
    let initialSnapshot: { transport: ControlledTransport; request: Request } | undefined;
    let replacementSubscription: { transport: ControlledTransport; request: Request } | undefined;
    let stabilizingSnapshot: { transport: ControlledTransport; request: Request } | undefined;
    let replacementAcknowledged = false;
    const connector = new ControlledConnector((transport, request) => {
      if (request.method === "ping") transport.respond(request, pong());
      if (request.method === "events.subscribe") {
        const subscriptions = request.params.subscriptions;
        const includesPane =
          Array.isArray(subscriptions) && subscriptions.some((value) => isRecord(value) && value.pane_id === "pane-1");
        if (includesPane) replacementSubscription = { transport, request };
        else transport.respond(request, subscribeAck());
      }
      if (request.method === "session.snapshot") {
        if (initialSnapshot === undefined) initialSnapshot = { transport, request };
        else {
          expect(replacementAcknowledged).toBe(true);
          stabilizingSnapshot = { transport, request };
        }
      }
    });
    const replaceSnapshot = vi.fn();
    const projectionConsumer: HerdrSessionProjectionConsumer = {
      replaceSnapshot,
      connectionClosed: vi.fn(),
    };
    const pending = connection(connector).bootstrap(projectionConsumer);

    await waitFor(
      () => initialSnapshot,
      (request) => expect(request).toBeDefined(),
    );
    initialSnapshot?.transport.respond(initialSnapshot.request, snapshotResult(["pane-1"]));
    await waitFor(
      () => replacementSubscription,
      (request) => expect(request).toBeDefined(),
    );

    const oldSubscription = connector.transports[1];
    if (oldSubscription === undefined) throw new Error("The initial subscription transport was not created.");
    expect(oldSubscription.disposed).toBe(false);
    replacementAcknowledged = true;
    replacementSubscription?.transport.respond(replacementSubscription.request, subscribeAck());

    await waitFor(
      () => stabilizingSnapshot,
      (request) => expect(request).toBeDefined(),
    );
    stabilizingSnapshot?.transport.respond(stabilizingSnapshot.request, snapshotResult(["pane-1"]));
    await pending;

    expect(replaceSnapshot).toHaveBeenCalledTimes(2);
    expect(oldSubscription.disposed).toBe(true);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("connection cancelled");
}
