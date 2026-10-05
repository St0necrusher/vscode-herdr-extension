import { describe, expect, it, vi } from "vitest";
import type {
  HerdrSessionConnection,
  HerdrSessionProjectionConsumer,
  HerdrSessionSnapshot,
} from "../../../src/capabilities/sessions";
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

type SnapshotLabels = Readonly<{
  paneLabel?: string | null;
  tabLabel?: string;
  spaceLabel?: string;
}>;

function snapshotResult(paneIds: readonly string[] = [], labels: SnapshotLabels = {}): Record<string, unknown> {
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
              label: labels.spaceLabel ?? "Space",
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
              label: labels.tabLabel ?? "Tab",
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
        label: labels.paneLabel,
      })),
      layouts: [],
      agents: [],
      unknown_snapshot_field: "ignored",
    },
  };
}

function tabCreatedResult(paneId: string): Record<string, unknown> {
  return {
    type: "tab_created",
    tab: {
      tab_id: "tab-created",
      workspace_id: "space-1",
      number: 2,
      label: "Tab",
      focused: false,
      pane_count: 1,
      agent_status: "idle",
    },
    root_pane: {
      pane_id: paneId,
      terminal_id: `terminal-${paneId}`,
      workspace_id: "space-1",
      tab_id: "tab-created",
      focused: false,
      agent_status: "idle",
      revision: 0,
    },
  };
}

function subscribeAck(): Record<string, unknown> {
  return { type: "subscription_started", unknown_ack_field: "ignored" };
}

async function waitFor<T>(read: () => T, assertion: (value: T) => void): Promise<void> {
  await vi.waitFor(() => assertion(read()), { timeout: 1_000, interval: 1 });
}

type CreationScenario = Readonly<{
  name: string;
  method: string;
  params: Readonly<Record<string, unknown>>;
  response: Record<string, unknown>;
  expected: unknown;
  invoke: (sessionConnection: HerdrSessionConnection) => Promise<unknown>;
}>;

const creationScenarios: readonly CreationScenario[] = [
  {
    name: "createSpace",
    method: "workspace.create",
    params: { cwd: "/work/new-space", focus: false },
    response: {
      type: "workspace_created",
      workspace: {
        workspace_id: "space-created",
        number: 2,
        label: "New Space",
        focused: false,
        pane_count: 1,
        tab_count: 1,
        active_tab_id: "tab-created",
        agent_status: "idle",
      },
      tab: {
        tab_id: "tab-created",
        workspace_id: "space-created",
        number: 1,
        label: "Tab",
        focused: false,
        pane_count: 1,
        agent_status: "idle",
      },
      root_pane: {
        pane_id: "pane-created",
        terminal_id: "terminal-created",
        workspace_id: "space-created",
        tab_id: "tab-created",
        focused: false,
        agent_status: "idle",
        revision: 0,
      },
    },
    expected: { spaceId: "space-created", paneId: "pane-created" },
    invoke: (sessionConnection) => sessionConnection.createSpace("/work/new-space"),
  },
  {
    name: "createPane",
    method: "tab.create",
    params: { workspace_id: "space-1", focus: false },
    response: tabCreatedResult("pane-created"),
    expected: { paneId: "pane-created" },
    invoke: (sessionConnection) => sessionConnection.createPane("space-1"),
  },
  {
    name: "createPane for a script",
    method: "tab.create",
    params: { workspace_id: "space-1", focus: false, cwd: "/work/packages/web", label: "dev" },
    response: tabCreatedResult("pane-created"),
    expected: { paneId: "pane-created" },
    invoke: (sessionConnection) => sessionConnection.createPane("space-1", { cwd: "/work/packages/web", label: "dev" }),
  },
  {
    name: "runCommand",
    method: "pane.send_input",
    params: { pane_id: "pane-1", text: "pnpm run dev", keys: ["Enter"] },
    response: { type: "ok" },
    expected: undefined,
    invoke: (sessionConnection) => sessionConnection.runCommand("pane-1", "pnpm run dev"),
  },
  {
    name: "splitPane",
    method: "pane.split",
    params: { target_pane_id: "pane-1", direction: "down", focus: false },
    response: {
      type: "pane_info",
      pane: {
        pane_id: "pane-split",
        terminal_id: "terminal-split",
        workspace_id: "space-1",
        tab_id: "tab-1",
        focused: false,
        agent_status: "idle",
        revision: 1,
      },
    },
    expected: { paneId: "pane-split" },
    invoke: (sessionConnection) => sessionConnection.splitPane("pane-1", "down"),
  },
];

type MutationScenario = Readonly<{
  name: string;
  method: string;
  params: Readonly<Record<string, unknown>>;
  response: Record<string, unknown>;
  snapshotAfterMutation: Record<string, unknown>;
  invoke: (sessionConnection: HerdrSessionConnection) => Promise<void>;
  assertPublishedSnapshot: (snapshot: HerdrSessionSnapshot) => void;
}>;

function paneInfoResult(paneId: string, label: string | null): Record<string, unknown> {
  return {
    type: "pane_info",
    pane: {
      pane_id: paneId,
      terminal_id: `terminal-${paneId}`,
      workspace_id: "space-1",
      tab_id: "tab-1",
      focused: true,
      agent_status: "idle",
      revision: 1,
      label,
    },
  };
}

function tabInfoResult(label: string): Record<string, unknown> {
  return {
    type: "tab_info",
    tab: {
      tab_id: "tab-1",
      workspace_id: "space-1",
      number: 1,
      label,
      focused: true,
      pane_count: 1,
      agent_status: "idle",
    },
  };
}

function workspaceInfoResult(label: string): Record<string, unknown> {
  return {
    type: "workspace_info",
    workspace: {
      workspace_id: "space-1",
      number: 1,
      label,
      focused: true,
      pane_count: 1,
      tab_count: 1,
      active_tab_id: "tab-1",
      agent_status: "idle",
    },
  };
}

const mutationScenarios: readonly MutationScenario[] = [
  {
    name: "renamePane",
    method: "pane.rename",
    params: { pane_id: "pane-1", label: "Build" },
    response: paneInfoResult("pane-1", "Build"),
    snapshotAfterMutation: snapshotResult(["pane-1"], { paneLabel: "Build" }),
    invoke: (sessionConnection) => sessionConnection.renamePane("pane-1", "Build"),
    assertPublishedSnapshot: (snapshot) => {
      const pane = snapshot.panes.find((candidate) => candidate.id === "pane-1");
      expect(pane?.label).toBe("Build");
    },
  },
  {
    name: "renamePane with a null label",
    method: "pane.rename",
    params: { pane_id: "pane-1", label: null },
    response: paneInfoResult("pane-1", null),
    snapshotAfterMutation: snapshotResult(["pane-1"], { paneLabel: null }),
    invoke: (sessionConnection) => sessionConnection.renamePane("pane-1", null),
    assertPublishedSnapshot: (snapshot) => {
      const pane = snapshot.panes.find((candidate) => candidate.id === "pane-1");
      expect(pane).toBeDefined();
      expect(pane?.label).toBeUndefined();
    },
  },
  {
    name: "renameTab",
    method: "tab.rename",
    params: { tab_id: "tab-1", label: "Build" },
    response: tabInfoResult("Build"),
    snapshotAfterMutation: snapshotResult(["pane-1"], { tabLabel: "Build" }),
    invoke: (sessionConnection) => sessionConnection.renameTab("tab-1", "Build"),
    assertPublishedSnapshot: (snapshot) => {
      const herdrTab = snapshot.herdrTabs.find((candidate) => candidate.id === "tab-1");
      expect(herdrTab?.label).toBe("Build");
    },
  },
  {
    name: "moveTab",
    method: "tab.move",
    params: { tab_id: "tab-1", insert_index: 0 },
    response: { type: "tab_list", tabs: [tabInfoResult("1").tab] },
    snapshotAfterMutation: snapshotResult(["pane-1"]),
    invoke: (sessionConnection) => sessionConnection.moveTab("tab-1", 0),
    assertPublishedSnapshot: (snapshot) => {
      expect(snapshot.herdrTabs.map((herdrTab) => herdrTab.id)).toEqual(["tab-1"]);
    },
  },
  {
    name: "renameSpace",
    method: "workspace.rename",
    params: { workspace_id: "space-1", label: "Build" },
    response: workspaceInfoResult("Build"),
    snapshotAfterMutation: snapshotResult(["pane-1"], { spaceLabel: "Build" }),
    invoke: (sessionConnection) => sessionConnection.renameSpace("space-1", "Build"),
    assertPublishedSnapshot: (snapshot) => {
      const space = snapshot.spaces.find((candidate) => candidate.id === "space-1");
      expect(space?.label).toBe("Build");
    },
  },
  {
    name: "closePane",
    method: "pane.close",
    params: { pane_id: "pane-1" },
    response: { type: "ok" },
    snapshotAfterMutation: snapshotResult(),
    invoke: (sessionConnection) => sessionConnection.closePane("pane-1"),
    assertPublishedSnapshot: (snapshot) => {
      expect(snapshot.spaces).toEqual([]);
      expect(snapshot.herdrTabs).toEqual([]);
      expect(snapshot.panes).toEqual([]);
    },
  },
  {
    name: "closeTab",
    method: "tab.close",
    params: { tab_id: "tab-1" },
    response: { type: "ok" },
    snapshotAfterMutation: snapshotResult(),
    invoke: (sessionConnection) => sessionConnection.closeTab("tab-1"),
    assertPublishedSnapshot: (snapshot) => {
      expect(snapshot.spaces).toEqual([]);
      expect(snapshot.herdrTabs).toEqual([]);
      expect(snapshot.panes).toEqual([]);
    },
  },
  {
    name: "closeSpace with close_group false",
    method: "workspace.close",
    params: { workspace_id: "space-1", close_group: false },
    response: { type: "ok" },
    snapshotAfterMutation: snapshotResult(),
    invoke: (sessionConnection) => sessionConnection.closeSpace("space-1", false),
    assertPublishedSnapshot: (snapshot) => {
      expect(snapshot.spaces).toEqual([]);
      expect(snapshot.herdrTabs).toEqual([]);
      expect(snapshot.panes).toEqual([]);
    },
  },
  {
    name: "closeSpace with close_group true",
    method: "workspace.close",
    params: { workspace_id: "space-1", close_group: true },
    response: { type: "ok" },
    snapshotAfterMutation: snapshotResult(),
    invoke: (sessionConnection) => sessionConnection.closeSpace("space-1", true),
    assertPublishedSnapshot: (snapshot) => {
      expect(snapshot.spaces).toEqual([]);
      expect(snapshot.herdrTabs).toEqual([]);
      expect(snapshot.panes).toEqual([]);
    },
  },
];

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

  it.each(creationScenarios)("$name sends its exact Herdr request and returns server identities", async (scenario) => {
    const connector = new ControlledConnector((transport, request) => {
      if (request.method === "ping") transport.respond(request, pong());
      if (request.method === "events.subscribe") transport.respond(request, subscribeAck());
      if (request.method === "session.snapshot") transport.respond(request, snapshotResult());
      if (request.method === scenario.method) transport.respond(request, scenario.response);
    });
    const sessionConnection = connection(connector);

    await sessionConnection.bootstrap(consumer());
    const result = await scenario.invoke(sessionConnection);

    expect(result).toEqual(scenario.expected);
    const creationRequests = connector.requests
      .filter(({ request }) => request.method === scenario.method)
      .map(({ request }) => ({ method: request.method, params: request.params }));
    expect(creationRequests).toEqual([{ method: scenario.method, params: scenario.params }]);
    sessionConnection.dispose();
  });

  it.each(mutationScenarios)(
    "$name sends its exact Herdr mutation and resolves after publishing its fresh snapshot",
    async (scenario) => {
      let bootstrapComplete = false;
      let mutationRequest: { transport: ControlledTransport; request: Request } | undefined;
      let postMutationSnapshot: { transport: ControlledTransport; request: Request } | undefined;
      let mutationResponseDelivered = false;
      let snapshotRequestedBeforeMutationResponse: Request | undefined;
      const connector = new ControlledConnector((transport, request) => {
        if (request.method === "ping") transport.respond(request, pong());
        if (request.method === "events.subscribe") transport.respond(request, subscribeAck());
        if (request.method === "session.snapshot") {
          if (bootstrapComplete) {
            if (mutationResponseDelivered) {
              if (postMutationSnapshot === undefined) postMutationSnapshot = { transport, request };
              else transport.respond(request, scenario.snapshotAfterMutation);
            } else {
              snapshotRequestedBeforeMutationResponse = request;
            }
          } else {
            transport.respond(request, snapshotResult(["pane-1"], { paneLabel: "Original pane" }));
          }
        }
        if (request.method === scenario.method) mutationRequest = { transport, request };
      });
      const replaceSnapshot = vi.fn<HerdrSessionProjectionConsumer["replaceSnapshot"]>();
      const sessionConnection = connection(connector);
      await sessionConnection.bootstrap({ replaceSnapshot, connectionClosed: vi.fn() });
      bootstrapComplete = true;

      let operationSettled = false;
      let operationError: unknown;
      let snapshotPublishedAtResolution: HerdrSessionSnapshot | undefined;
      const operation = scenario.invoke(sessionConnection).then(
        () => {
          operationSettled = true;
          snapshotPublishedAtResolution = replaceSnapshot.mock.calls.at(-1)?.[0];
        },
        (error: unknown) => {
          operationSettled = true;
          operationError = error;
        },
      );

      await waitFor(
        () => mutationRequest,
        (request) => expect(request).toBeDefined(),
      );
      if (mutationRequest === undefined) throw new Error("The Herdr mutation request was not captured.");
      expect(mutationRequest.request.method).toBe(scenario.method);
      expect(mutationRequest.request.params).toEqual(scenario.params);
      mutationResponseDelivered = true;
      mutationRequest.transport.respond(mutationRequest.request, scenario.response);

      await waitFor(
        () => postMutationSnapshot,
        (request) => expect(request).toBeDefined(),
      );
      if (postMutationSnapshot === undefined) throw new Error("The post-mutation snapshot request was not captured.");
      expect(snapshotRequestedBeforeMutationResponse).toBeUndefined();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(operationSettled).toBe(false);

      postMutationSnapshot.transport.respond(postMutationSnapshot.request, scenario.snapshotAfterMutation);
      await operation;
      expect(operationError).toBeUndefined();
      expect(operationSettled).toBe(true);
      if (snapshotPublishedAtResolution === undefined) {
        throw new Error("The operation resolved before a snapshot reached the projection consumer.");
      }
      scenario.assertPublishedSnapshot(snapshotPublishedAtResolution);
      sessionConnection.dispose();
    },
  );

  it("waits for a post-response snapshot to publish the created Pane before resolving", async () => {
    let snapshotRequestCount = 0;
    let heldSnapshot: { transport: ControlledTransport; request: Request } | undefined;
    let createdPaneSnapshot: { transport: ControlledTransport; request: Request } | undefined;
    let stabilizingSnapshot: { transport: ControlledTransport; request: Request } | undefined;
    let creationRequest: { transport: ControlledTransport; request: Request } | undefined;
    let createdPaneSubscription: { transport: ControlledTransport; request: Request } | undefined;
    const connector = new ControlledConnector((transport, request) => {
      if (request.method === "ping") transport.respond(request, pong());
      if (request.method === "events.subscribe") {
        const subscriptions = request.params.subscriptions;
        const isCreatedPaneSubscription = (value: unknown): boolean => {
          if (isRecord(value)) return value.pane_id === "pane-created";
          return false;
        };
        const includesCreatedPane = Array.isArray(subscriptions) && subscriptions.some(isCreatedPaneSubscription);
        if (includesCreatedPane) createdPaneSubscription = { transport, request };
        else transport.respond(request, subscribeAck());
      }
      if (request.method === "session.snapshot") {
        snapshotRequestCount += 1;
        if (snapshotRequestCount === 1) transport.respond(request, snapshotResult());
        else if (snapshotRequestCount === 2) heldSnapshot = { transport, request };
        else if (snapshotRequestCount === 3) createdPaneSnapshot = { transport, request };
        else stabilizingSnapshot = { transport, request };
      }
      if (request.method === "tab.create") creationRequest = { transport, request };
    });
    const replaceSnapshot = vi.fn<HerdrSessionProjectionConsumer["replaceSnapshot"]>();
    const projectionConsumer: HerdrSessionProjectionConsumer = { replaceSnapshot, connectionClosed: vi.fn() };
    const sessionConnection = connection(connector);
    await sessionConnection.bootstrap(projectionConsumer);

    const subscription = connector.transports[1];
    if (subscription === undefined) throw new Error("The initial subscription transport was not created.");
    subscription.emitEvent("workspace.updated");
    await waitFor(
      () => heldSnapshot,
      (request) => expect(request).toBeDefined(),
    );

    let creationSettled = false;
    let panePublishedWhenCreationResolved = false;
    const creationPromise = sessionConnection.createPane("space-1").then(
      (result) => {
        creationSettled = true;
        const createdPaneWasPublished = replaceSnapshot.mock.calls.some(([snapshot]) =>
          snapshot.panes.some((pane) => pane.id === "pane-created"),
        );
        panePublishedWhenCreationResolved = createdPaneWasPublished;
        return result;
      },
      (error: unknown) => {
        creationSettled = true;
        throw error;
      },
    );
    await waitFor(
      () => creationRequest,
      (request) => expect(request).toBeDefined(),
    );
    if (creationRequest === undefined) throw new Error("The tab creation request was not captured.");
    creationRequest.transport.respond(creationRequest.request, tabCreatedResult("pane-created"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(creationSettled).toBe(false);

    if (heldSnapshot === undefined) throw new Error("The pre-creation snapshot request was not held.");
    heldSnapshot.transport.respond(heldSnapshot.request, snapshotResult());
    await waitFor(
      () => createdPaneSnapshot,
      (request) => expect(request).toBeDefined(),
    );
    expect(creationSettled).toBe(false);

    if (createdPaneSnapshot === undefined) throw new Error("The post-creation snapshot request was not created.");
    createdPaneSnapshot.transport.respond(createdPaneSnapshot.request, snapshotResult(["pane-created"]));
    await waitFor(
      () => createdPaneSubscription,
      (request) => expect(request).toBeDefined(),
    );
    if (createdPaneSubscription === undefined) throw new Error("The created Pane subscription was not requested.");
    createdPaneSubscription.transport.respond(createdPaneSubscription.request, subscribeAck());

    await waitFor(
      () => stabilizingSnapshot,
      (request) => expect(request).toBeDefined(),
    );
    if (stabilizingSnapshot === undefined) throw new Error("The stabilizing snapshot request was not created.");
    stabilizingSnapshot.transport.respond(stabilizingSnapshot.request, snapshotResult(["pane-created"]));

    await expect(creationPromise).resolves.toEqual({ paneId: "pane-created" });
    expect(panePublishedWhenCreationResolved).toBe(true);
    sessionConnection.dispose();
  });

  it("keeps the Herdr Session connection open after a creation request error", async () => {
    let liveSnapshot: { transport: ControlledTransport; request: Request } | undefined;
    let snapshotRequestCount = 0;
    const connector = new ControlledConnector((transport, request) => {
      if (request.method === "ping") transport.respond(request, pong());
      if (request.method === "events.subscribe") transport.respond(request, subscribeAck());
      if (request.method === "session.snapshot") {
        snapshotRequestCount += 1;
        if (snapshotRequestCount === 1) transport.respond(request, snapshotResult());
        else liveSnapshot = { transport, request };
      }
      if (request.method === "workspace.create") {
        transport.emit({
          id: request.id,
          error: { code: "SPACE_CREATE_DENIED", message: "Space creation denied" },
        });
      }
    });
    const replaceSnapshot = vi.fn();
    const connectionClosed = vi.fn();
    const sessionConnection = connection(connector);
    await sessionConnection.bootstrap({ replaceSnapshot, connectionClosed });

    await expect(sessionConnection.createSpace("/work/denied")).rejects.toMatchObject({
      response: { code: "SPACE_CREATE_DENIED", message: "Space creation denied" },
    });
    expect(connectionClosed).not.toHaveBeenCalled();

    const subscription = connector.transports[1];
    if (subscription === undefined) throw new Error("The initial subscription transport was not created.");
    subscription.emitEvent("workspace.updated");
    await waitFor(
      () => liveSnapshot,
      (request) => expect(request).toBeDefined(),
    );
    if (liveSnapshot === undefined) throw new Error("The live reconciliation snapshot was not requested.");
    liveSnapshot.transport.respond(liveSnapshot.request, snapshotResult());
    await waitFor(
      () => replaceSnapshot.mock.calls.length,
      (replacements) => expect(replacements).toBe(2),
    );

    expect(connectionClosed).not.toHaveBeenCalled();
    sessionConnection.dispose();
  });

  it("fails the Herdr Session connection when reconciliation fails after creation", async () => {
    let creationSnapshot: { transport: ControlledTransport; request: Request } | undefined;
    let snapshotRequestCount = 0;
    const connector = new ControlledConnector((transport, request) => {
      if (request.method === "ping") transport.respond(request, pong());
      if (request.method === "events.subscribe") transport.respond(request, subscribeAck());
      if (request.method === "session.snapshot") {
        snapshotRequestCount += 1;
        if (snapshotRequestCount === 1) transport.respond(request, snapshotResult());
        else creationSnapshot = { transport, request };
      }
      if (request.method === "tab.create") transport.respond(request, tabCreatedResult("pane-created"));
    });
    const connectionClosed = vi.fn();
    const sessionConnection = connection(connector);
    await sessionConnection.bootstrap({ replaceSnapshot: vi.fn(), connectionClosed });

    const creationPromise = sessionConnection.createPane("space-1");
    await waitFor(
      () => creationSnapshot,
      (request) => expect(request).toBeDefined(),
    );
    if (creationSnapshot === undefined) throw new Error("The post-creation snapshot request was not created.");
    creationSnapshot.transport.emit({
      id: creationSnapshot.request.id,
      error: { code: "SNAPSHOT_AFTER_CREATE_FAILED", message: "Post-creation snapshot unavailable" },
    });

    await expect(creationPromise).rejects.toMatchObject({
      failure: {
        kind: "herdr-error",
        code: "SNAPSHOT_AFTER_CREATE_FAILED",
        message: "Post-creation snapshot unavailable",
        operation: "snapshot",
      },
    });
    expect(connectionClosed).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "herdr-error",
        code: "SNAPSHOT_AFTER_CREATE_FAILED",
        message: "Post-creation snapshot unavailable",
        operation: "snapshot",
      }),
    );
    sessionConnection.dispose();
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("connection cancelled");
}
