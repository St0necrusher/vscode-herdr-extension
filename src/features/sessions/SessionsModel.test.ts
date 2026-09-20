import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HerdrConfiguration,
  HerdrConnectionFailure,
  HerdrResolvedSession,
  HerdrSessionConnection,
  HerdrSessionConnectionFactory,
  HerdrSessionDirectory,
  HerdrSessionMetadata,
  HerdrSessionSnapshot,
  HerdrSessionDescriptor,
} from "@capabilities/sessions";
import { HerdrConnectionFailureError } from "@capabilities/sessions";
import type { PersistentKeyValueStorage } from "./capabilities";
import { SessionsModel } from "./SessionsModel";

const configuration: HerdrConfiguration = { executable: "herdr", session: "default" };
const defaultSession: HerdrSessionDescriptor = {
  id: "default",
  isDefault: true,
  availability: "running",
  endpoint: "/tmp/default.sock",
};
const workSession: HerdrSessionDescriptor = {
  id: "work",
  isDefault: false,
  availability: "running",
  endpoint: "/tmp/work.sock",
};
const stoppedSession: HerdrSessionDescriptor = { id: "work", isDefault: false, availability: "stopped" };
const allSessions = [defaultSession, stoppedSession] as const;
const metadata: HerdrSessionMetadata = { version: "1", protocol: 1 };
const snapshot: HerdrSessionSnapshot = {
  version: "1",
  protocol: 1,
  spaces: [],
  herdrTabs: [],
  panes: [],
  layouts: [],
  agents: [],
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

interface ConnectionRecord {
  id: string;
  disposed: boolean;
  consumer?: Parameters<HerdrSessionConnection["bootstrap"]>[0];
  settle(): void;
  fail(error: unknown): void;
  replaceSnapshot(next: HerdrSessionSnapshot): void;
  close(failure: HerdrConnectionFailure): void;
}

type HarnessOptions = Readonly<{
  saved?: string;
  configuredSession?: string;
  sessions?: readonly HerdrSessionDescriptor[];
  listResult?: Awaited<ReturnType<HerdrSessionDirectory["list"]>>;
  list?: () => Promise<Awaited<ReturnType<HerdrSessionDirectory["list"]>>>;
  autoConnections?: boolean;
  connectionFailure?: unknown;
  connectionPlan?: readonly Readonly<{
    auto?: boolean;
    failure?: unknown;
    snapshot?: HerdrSessionSnapshot;
  }>[];
  start?: () => ReturnType<HerdrSessionDirectory["start"]>;
  autoStorage?: boolean;
  storageFailure?: unknown;
}>;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function success(sessions: readonly HerdrSessionDescriptor[] = allSessions) {
  return { kind: "success" as const, sessions };
}

function createHarness(options: HarnessOptions = {}) {
  let configurationValue: HerdrConfiguration = {
    ...configuration,
    ...(options.configuredSession === undefined ? {} : { session: options.configuredSession }),
  };
  let configurationListener: (() => void) | undefined;
  let saved = options.saved;
  const storageWrites: { key: string; value: unknown; deferred: Deferred<undefined> }[] = [];
  const logger = { info: vi.fn(), error: vi.fn(), show: vi.fn() };
  const records: ConnectionRecord[] = [];
  const list = options.list ?? (() => Promise.resolve(options.listResult ?? success(options.sessions)));
  const start = vi.fn(options.start ?? (() => Promise.resolve()));
  const resolve = vi.fn((_nextConfiguration: HerdrConfiguration, id: string) =>
    Promise.resolve({ id, endpoint: `/tmp/${id}.sock` }),
  );
  const directory: HerdrSessionDirectory = { list: vi.fn(list), resolve, start };
  const storage: PersistentKeyValueStorage = {
    get: () => saved,
    update: (key, value) => {
      const pending = deferred<undefined>();
      storageWrites.push({ key, value, deferred: pending });
      if (options.storageFailure !== undefined) {
        pending.reject(options.storageFailure);
      } else if (options.autoStorage !== false) {
        saved = typeof value === "string" ? value : undefined;
        pending.resolve(undefined);
      }
      return pending.promise;
    },
  };
  const connectionFactory: HerdrSessionConnectionFactory = {
    create: (resolved: HerdrResolvedSession) => {
      const bootstrap = deferred<HerdrSessionMetadata>();
      const plan = options.connectionPlan?.[records.length];
      const record: ConnectionRecord = {
        id: resolved.id,
        disposed: false,
        settle: () => {
          record.replaceSnapshot(plan?.snapshot ?? snapshot);
          bootstrap.resolve(metadata);
        },
        fail: (error) => bootstrap.reject(error),
        replaceSnapshot: (next) => record.consumer?.replaceSnapshot(next),
        close: (failure) => record.consumer?.connectionClosed(failure),
      };
      records.push(record);
      const connection: HerdrSessionConnection = {
        bootstrap: (consumer) => {
          record.consumer = consumer;
          const failure = plan?.failure ?? options.connectionFailure;
          if (failure !== undefined)
            return Promise.reject(failure instanceof Error ? failure : new Error(JSON.stringify(failure)));
          if (plan?.auto !== false && options.autoConnections !== false) record.settle();
          return bootstrap.promise;
        },
        dispose: () => {
          record.disposed = true;
        },
      };
      return connection;
    },
  };
  const configurationSource = {
    read: () => configurationValue,
    onDidChange: (listener: () => void) => {
      configurationListener = listener;
      return { dispose: () => (configurationListener = undefined) };
    },
  };
  const model = new SessionsModel(directory, connectionFactory, configurationSource, storage, logger);
  return {
    model,
    directory,
    resolve,
    logger,
    records,
    start,
    storageWrites,
    getSaved: () => saved,
    setConfiguration(next: HerdrConfiguration) {
      configurationValue = next;
      configurationListener?.();
    },
    hasConfigurationListener: () => configurationListener !== undefined,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  await vi.waitFor(() => expect(read()).toBeDefined());
  return read() as T;
}

describe("SessionsModel", () => {
  it.each([
    ["success", success(), "ready"],
    ["missing executable", { kind: "missing-executable" as const }, "missing-executable"],
    ["failure", { kind: "failure" as const, diagnostic: "list failed" }, "error"],
  ])("publishes listing %s", async (_name, result, expected) => {
    const h = createHarness({ listResult: result });
    await h.model.initialize();
    expect(h.model.getState().catalog.kind).toBe(expected);
    if (expected !== "ready") expect(h.model.getState().active.kind).toBe("unselected");
  });

  it("rejects a stale listing after a newer refresh", async () => {
    const first = deferred<Awaited<ReturnType<HerdrSessionDirectory["list"]>>>();
    const second = deferred<Awaited<ReturnType<HerdrSessionDirectory["list"]>>>();
    const h = createHarness({ list: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) });
    const initialization = h.model.initialize();
    const refresh = h.model.refresh();
    second.resolve(success([workSession]));
    await refresh;
    first.resolve({ kind: "missing-executable" });
    await initialization;
    expect(h.model.getState().catalog).toEqual({ kind: "ready", sessions: [workSession] });
  });

  it("applies saved, configured, then default selection precedence", async () => {
    const saved = createHarness({ saved: "work" });
    await saved.model.initialize();
    expect(saved.model.getState().active).toMatchObject({ session: { id: "work" } });

    const configured = createHarness({ configuredSession: "work" });
    await configured.model.initialize();
    expect(configured.model.getState().active).toMatchObject({ session: { id: "work" } });

    const fallback = createHarness({ configuredSession: "unknown", sessions: [defaultSession] });
    await fallback.model.initialize();
    expect(fallback.model.getState().active).toMatchObject({ session: { id: "default" } });
  });

  it("heals an unavailable saved selection and preserves stopped selection without auto-start", async () => {
    const h = createHarness({ saved: "removed" });
    await h.model.initialize();
    expect(h.getSaved()).toBe("default");
    expect(h.model.getState().active).toMatchObject({ session: { id: "default" } });
    expect(h.start).not.toHaveBeenCalled();

    const stopped = createHarness({ saved: "work" });
    await stopped.model.initialize();
    expect(stopped.model.getState().active).toMatchObject({ kind: "selected-stopped", session: { id: "work" } });
    expect(stopped.records).toHaveLength(0);
  });

  it("starts only the explicitly selected stopped Session", async () => {
    const h = createHarness({
      saved: "work",
      list: vi
        .fn()
        .mockResolvedValueOnce(success())
        .mockResolvedValueOnce(success([workSession])),
    });
    await h.model.initialize();
    await h.model.startSelectedSession();
    expect(h.start).toHaveBeenCalledWith(configuration, "work");
    expect(h.records).toHaveLength(1);
  });

  it("keeps a ready catalog when explicit Start fails and permits another selection", async () => {
    const h = createHarness({ saved: "work", start: () => Promise.reject(new Error("start denied")) });
    await h.model.initialize();
    await h.model.startSelectedSession();

    expect(h.model.getState()).toMatchObject({
      catalog: { kind: "ready", sessions: allSessions },
      active: { kind: "start-failed", session: { id: "work" }, diagnostic: "start denied" },
    });

    await h.model.selectSession("default");
    expect(h.model.getState()).toMatchObject({
      catalog: { kind: "ready" },
      active: { kind: "connected", session: { id: "default" } },
    });
  });

  it.each([
    ["success", undefined],
    ["failure", new Error("late Start failure")],
  ] as const)("ignores stale explicit Start %s after selecting another Session", async (_outcome, failure) => {
    const gate = deferred<undefined>();
    const h = createHarness({ saved: "work", start: () => gate.promise });
    await h.model.initialize();
    const transitions: string[] = [];
    h.model.onDidChange((state) => transitions.push(`${state.catalog.kind}:${state.active.kind}`));

    const pendingStart = h.model.startSelectedSession();
    await vi.waitFor(() => expect(h.start).toHaveBeenCalled());
    await h.model.selectSession("default");
    const afterSelection = transitions.length;
    if (failure === undefined) gate.resolve(undefined);
    else gate.reject(failure);
    await pendingStart;

    expect(h.model.getState()).toMatchObject({
      catalog: { kind: "ready" },
      active: { kind: "connected", session: { id: "default" } },
    });
    expect(transitions.slice(afterSelection)).toEqual([]);
  });

  it("serializes persistence writes and lets the latest selection win", async () => {
    const h = createHarness({ autoStorage: false, saved: "removed" });
    const initialization = h.model.initialize();
    await vi.waitFor(() => expect(h.storageWrites).toHaveLength(1));
    const selection = h.model.selectSession("work");
    expect(h.storageWrites).toHaveLength(1);
    const firstWrite = h.storageWrites[0];
    if (firstWrite === undefined) throw new Error("first persistence write was not created");
    firstWrite.deferred.resolve(undefined);
    await vi.waitFor(() => expect(h.storageWrites).toHaveLength(2));
    const secondWrite = h.storageWrites[1];
    if (secondWrite === undefined) throw new Error("second persistence write was not created");
    secondWrite.deferred.resolve(undefined);
    await Promise.all([initialization, selection]);
    expect(h.storageWrites.map(({ value }) => value)).toEqual(["default", "work"]);
  });

  it("logs persistence failure without rolling back selected state", async () => {
    const h = createHarness({ saved: "removed", storageFailure: new Error("workspace state unavailable") });
    await h.model.initialize();
    expect(h.model.getState().active).toMatchObject({ session: { id: "default" } });
    expect(h.logger.error).toHaveBeenCalledWith(expect.stringContaining("Failed to persist"), expect.any(Error));
  });

  it("disposes the old connection and rejects stale resolve/bootstrap/snapshot callbacks", async () => {
    const resolveDefault = deferred<HerdrResolvedSession>();
    const h = createHarness({ autoConnections: false, sessions: [defaultSession, workSession] });
    vi.mocked(h.resolve).mockImplementation((_, id) =>
      id === "default" ? resolveDefault.promise : Promise.resolve({ id, endpoint: "/tmp/work.sock" }),
    );
    const initialization = h.model.initialize();
    await vi.waitFor(() => expect(h.model.getState().active.kind).toBe("resolving"));
    const selection = h.model.selectSession("work");
    await vi.waitFor(() => expect(h.records).toHaveLength(1));
    const workConnection = h.records[0];
    if (workConnection === undefined) throw new Error("work connection was not created");
    workConnection.settle();
    await selection;
    resolveDefault.resolve({ id: "default", endpoint: "/tmp/default.sock" });
    await initialization;
    expect(h.model.getState().active).toMatchObject({ kind: "connected", session: { id: "work" } });
    expect(h.records).toHaveLength(1);
    expect(h.records[0]?.id).toBe("work");
    expect(h.model.getState().active).toMatchObject({ kind: "connected", session: { id: "work" } });
  });

  it("rejects a stale bootstrap from a replaced connection", async () => {
    const h = createHarness({ autoConnections: false, sessions: [defaultSession, workSession] });
    const initialization = h.model.initialize();
    const old = await waitFor(() => h.records[0]);
    const selection = h.model.selectSession("work");
    await vi.waitFor(() => expect(h.records).toHaveLength(2));
    const current = h.records[1];
    if (current === undefined) throw new Error("work connection was not created");
    current.settle();
    await selection;
    old.settle();
    await initialization;
    expect(old.disposed).toBe(true);
    expect(h.model.getState().active).toMatchObject({ kind: "connected", session: { id: "work" } });
  });

  it("disposes a connected connection when selection changes", async () => {
    const h = createHarness({ sessions: [defaultSession, workSession] });
    await h.model.initialize();
    const old = h.records[0];
    if (old === undefined) throw new Error("default connection was not created");
    await h.model.selectSession("work");
    expect(old.disposed).toBe(true);
    old.replaceSnapshot({ ...snapshot, version: "stale" });
    old.close({ kind: "transport", diagnostic: "stale close" });
    expect(h.model.getState().active).toMatchObject({ kind: "connected", session: { id: "work" } });
  });

  it("publishes connected only after authoritative metadata and snapshot", async () => {
    const h = createHarness({ autoConnections: false });
    const initialization = h.model.initialize();
    const record = await waitFor(() => h.records[0]);
    expect(h.model.getState().active.kind).toBe("connecting");
    record.settle();
    await initialization;
    expect(h.model.getState().active).toMatchObject({ kind: "connected", metadata, snapshot });
  });

  it.each([
    [{ kind: "incompatible", diagnostic: "unsupported protocol" }, "incompatible"],
    [{ kind: "transport", diagnostic: "socket closed" }, "reconnecting"],
  ] as const)("publishes authoritative %s connection failure", async (failure, expected) => {
    const h = createHarness({ connectionFailure: new HerdrConnectionFailureError(failure) });
    await h.model.initialize();
    expect(h.model.getState().active.kind).toBe(expected);
  });

  it("transitions to reconnecting on unexpected closure and ignores observer failures", async () => {
    const h = createHarness({ connectionPlan: [{}, { auto: false }] });
    const seen: string[] = [];
    h.model.onDidChange((state) => {
      seen.push(state.active.kind);
      throw new Error("observer failure");
    });
    h.model.onDidChange((state) => seen.push(state.active.kind));
    await h.model.initialize();
    const connection = h.records[0];
    if (connection === undefined) throw new Error("default connection was not created");
    connection.close({ kind: "transport", diagnostic: "socket closed" });
    await vi.waitFor(() => expect(h.records).toHaveLength(2));
    expect(h.model.getState().active).toMatchObject({
      kind: "reconnecting",
      failure: { diagnostic: "socket closed" },
      staleProjection: { metadata, snapshot },
      phase: { kind: "attempting" },
    });
    expect(h.records[0]?.disposed).toBe(true);
    expect(seen).toContain("reconnecting");
  });

  it("enters reconnect recovery after an initial retryable failure without stale context", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const h = createHarness({ connectionPlan: [{ failure: new Error("socket unavailable") }] });

    await h.model.initialize();

    expect(h.model.getState().active).toMatchObject({
      kind: "reconnecting",
      failure: { kind: "transport", diagnostic: "socket unavailable" },
      phase: { kind: "waiting", retryAt: 500 },
    });
    expect(h.model.getState().active).not.toHaveProperty("staleProjection");
    expect(vi.getTimerCount()).toBe(1);
    h.model.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.records).toHaveLength(1);
  });

  it("resolves a fresh endpoint and creates a fresh connection for each retry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const h = createHarness({
      connectionPlan: [{ failure: new Error("first failure") }, { failure: new Error("second failure") }, {}],
    });

    await h.model.initialize();
    expect(h.resolve).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.resolve).toHaveBeenCalledTimes(2);
    expect(h.records).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.resolve).toHaveBeenCalledTimes(3);
    expect(h.records).toHaveLength(3);
    expect(h.model.getState().active).toMatchObject({ kind: "connected", metadata, snapshot });
    expect(h.records.map((record) => record.id)).toEqual(["default", "default", "default"]);
    h.model.dispose();
  });

  it("uses the approved base wait sequence and repeats the 30-second cap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const h = createHarness({
      connectionPlan: Array.from({ length: 8 }, (_, index) => ({ failure: new Error(`failure ${index}`) })),
    });
    const waits = [500, 1000, 2000, 5000, 10000, 30000, 30000] as const;

    await h.model.initialize();
    for (const [index, wait] of waits.entries()) {
      const active = h.model.getState().active;
      expect(active).toMatchObject({ kind: "reconnecting", phase: { kind: "waiting" } });
      if (active.kind !== "reconnecting" || active.phase.kind !== "waiting")
        throw new Error("expected waiting recovery");
      expect(active.phase.retryAt - Date.now()).toBe(wait);
      await vi.advanceTimersByTimeAsync(wait);
      expect(h.records).toHaveLength(index + 2);
    }
    h.model.dispose();
  });

  it("jitter stays within plus or minus twenty percent and separates model schedules", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(1);
    const first = createHarness({ connectionPlan: [{ failure: new Error("first") }] });
    const second = createHarness({ connectionPlan: [{ failure: new Error("second") }] });

    await first.model.initialize();
    await second.model.initialize();

    const firstActive = first.model.getState().active;
    const secondActive = second.model.getState().active;
    expect(firstActive).toMatchObject({ kind: "reconnecting", phase: { retryAt: 400 } });
    expect(secondActive).toMatchObject({ kind: "reconnecting", phase: { retryAt: 600 } });
    expect(firstActive).not.toEqual(secondActive);
    first.model.dispose();
    second.model.dispose();
  });

  it("retains one stale projection across failed retries", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const h = createHarness({ connectionPlan: [{}, { failure: new Error("reconnect failed") }] });

    await h.model.initialize();
    const initial = h.records[0];
    if (initial === undefined) throw new Error("initial connection was not created");
    initial.close({ kind: "transport", diagnostic: "socket closed" });
    await vi.waitFor(() =>
      expect(h.model.getState().active).toMatchObject({
        kind: "reconnecting",
        staleProjection: { metadata, snapshot },
        phase: { kind: "waiting" },
      }),
    );
    expect(h.model.getState().active).toMatchObject({ kind: "reconnecting", staleProjection: { metadata, snapshot } });
    h.model.dispose();
  });

  it("replaces stale projection with a fresh snapshot and resets backoff after bootstrap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const freshSnapshot = { ...snapshot, version: "2" };
    const h = createHarness({
      connectionPlan: [
        {},
        { failure: new Error("retry failed") },
        { snapshot: freshSnapshot },
        { failure: new Error("later retry failed") },
      ],
    });

    await h.model.initialize();
    h.records[0]?.close({ kind: "transport", diagnostic: "socket closed" });
    await vi.waitFor(() =>
      expect(h.model.getState().active).toMatchObject({ kind: "reconnecting", phase: { kind: "waiting" } }),
    );
    expect(h.model.getState().active).toMatchObject({ staleProjection: { snapshot } });
    const firstRetry = h.model.getState().active;
    if (firstRetry.kind !== "reconnecting" || firstRetry.phase.kind !== "waiting")
      throw new Error("expected waiting recovery");
    expect(firstRetry.phase.retryAt - Date.now()).toBeGreaterThanOrEqual(400);
    expect(firstRetry.phase.retryAt - Date.now()).toBeLessThanOrEqual(600);
    await vi.advanceTimersByTimeAsync(firstRetry.phase.retryAt - Date.now());
    expect(h.model.getState().active).toMatchObject({ kind: "connected", metadata, snapshot: freshSnapshot });
    h.records[2]?.close({ kind: "transport", diagnostic: "socket closed again" });
    await vi.waitFor(() => expect(h.records).toHaveLength(4));
    const laterRetry = h.model.getState().active;
    if (laterRetry.kind !== "reconnecting" || laterRetry.phase.kind !== "waiting")
      throw new Error("expected waiting recovery");
    expect(laterRetry.phase.retryAt - Date.now()).toBeGreaterThanOrEqual(400);
    expect(laterRetry.phase.retryAt - Date.now()).toBeLessThanOrEqual(600);
    h.model.dispose();
  });

  it("explicit Retry cancels a pending attempt and starts a fresh flow", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const h = createHarness({
      connectionPlan: [{ failure: new Error("initial failure") }, { auto: false }, {}],
    });

    await h.model.initialize();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.model.getState().active).toMatchObject({ kind: "reconnecting", phase: { kind: "attempting" } });
    const pending = h.records[1];
    if (pending === undefined) throw new Error("pending retry connection was not created");
    await h.model.retry();
    expect(pending.disposed).toBe(true);
    expect(h.records).toHaveLength(3);
    expect(h.model.getState().active).toMatchObject({ kind: "connected", metadata, snapshot });
    pending.settle();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.records).toHaveLength(3);
    h.model.dispose();
  });

  it("explicit Retry cancels a pending timer and resets the wait sequence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const h = createHarness({
      connectionPlan: [
        { failure: new Error("initial failure") },
        { failure: new Error("automatic retry failed") },
        { failure: new Error("explicit retry failed") },
        {},
      ],
    });

    await h.model.initialize();
    await vi.advanceTimersByTimeAsync(500);
    const beforeRetry = h.model.getState().active;
    if (beforeRetry.kind !== "reconnecting" || beforeRetry.phase.kind !== "waiting")
      throw new Error("expected the second automatic wait");
    expect(beforeRetry.phase.retryAt - Date.now()).toBe(1000);

    await h.model.retry();
    const afterRetry = h.model.getState().active;
    if (afterRetry.kind !== "reconnecting" || afterRetry.phase.kind !== "waiting")
      throw new Error("expected the restarted first wait");
    expect(afterRetry.phase.retryAt - Date.now()).toBe(500);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(499);
    expect(h.records).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.records).toHaveLength(4);
    expect(h.model.getState().active).toMatchObject({ kind: "connected", metadata, snapshot });
    h.model.dispose();
  });

  it("retains stale projection and suppresses automatic retry after live incompatibility", async () => {
    vi.useFakeTimers();
    const h = createHarness();

    await h.model.initialize();
    h.records[0]?.close({
      kind: "incompatible",
      diagnostic: "protocol changed",
      version: "2",
      protocol: 99,
    });

    expect(h.model.getState().active).toMatchObject({
      kind: "incompatible",
      staleProjection: { metadata, snapshot },
      failure: { diagnostic: "protocol changed", version: "2", protocol: 99 },
    });
    expect(vi.getTimerCount()).toBe(0);
    h.model.dispose();
  });

  it.each([
    ["reconnecting", { failure: new Error("initial failure") }],
    ["incompatible", { failure: new HerdrConnectionFailureError({ kind: "incompatible", diagnostic: "unsupported" }) }],
  ] as const)("selecting the already-selected %s Session explicitly restarts recovery", async (_kind, first) => {
    const h = createHarness({ connectionPlan: [first, {}] });
    await h.model.initialize();
    expect(h.model.getState().active.kind).toBe(_kind);
    await h.model.selectSession("default");
    expect(h.records).toHaveLength(2);
    expect(h.model.getState().active).toMatchObject({ kind: "connected", metadata, snapshot });
    h.model.dispose();
  });

  it("suppresses automatic retry for incompatibility but permits explicit and configuration recovery", async () => {
    vi.useFakeTimers();
    const explicit = createHarness({
      connectionPlan: [
        { failure: new HerdrConnectionFailureError({ kind: "incompatible", diagnostic: "unsupported" }) },
        {},
      ],
    });
    await explicit.model.initialize();
    expect(explicit.model.getState().active.kind).toBe("incompatible");
    expect(vi.getTimerCount()).toBe(0);
    await explicit.model.retry();
    expect(explicit.model.getState().active).toMatchObject({ kind: "connected", metadata, snapshot });
    explicit.model.dispose();

    const configured = createHarness({
      connectionPlan: [
        { failure: new HerdrConnectionFailureError({ kind: "incompatible", diagnostic: "unsupported" }) },
        {},
      ],
    });
    await configured.model.initialize();
    configured.setConfiguration({ ...configuration, executable: "other-herdr" });
    await vi.waitFor(() => expect(configured.model.getState().active.kind).toBe("connected"));
    expect(configured.records).toHaveLength(2);
    configured.model.dispose();
  });

  it("cancels a live recovery attempt when selecting another Session", async () => {
    const h = createHarness({
      sessions: [defaultSession, workSession],
      connectionPlan: [{}, { auto: false }, {}],
    });
    await h.model.initialize();
    h.records[0]?.close({ kind: "transport", diagnostic: "socket closed" });
    await vi.waitFor(() => expect(h.records).toHaveLength(2));
    const staleAttempt = h.records[1];
    if (staleAttempt === undefined) throw new Error("recovery attempt was not created");
    await h.model.selectSession("work");
    expect(staleAttempt.disposed).toBe(true);
    expect(h.model.getState().active).toMatchObject({ kind: "connected", session: { id: "work" } });
    staleAttempt.settle();
    expect(h.model.getState().active).toMatchObject({ kind: "connected", session: { id: "work" } });
    h.model.dispose();
  });

  it("cancels recovery on configuration refresh and suppresses late callbacks on disposal", async () => {
    const h = createHarness({
      configuredSession: "work",
      sessions: [defaultSession, workSession],
      connectionPlan: [{}, { auto: false }, {}, { auto: false }],
    });
    await h.model.initialize();
    h.records[0]?.close({ kind: "transport", diagnostic: "socket closed" });
    await vi.waitFor(() => expect(h.records).toHaveLength(2));
    const staleAttempt = h.records[1];
    if (staleAttempt === undefined) throw new Error("recovery attempt was not created");
    h.setConfiguration({ ...configuration, executable: "other-herdr", session: "work" });
    await vi.waitFor(() => expect(h.records).toHaveLength(3));
    expect(staleAttempt.disposed).toBe(true);
    expect(h.model.getState().active).toMatchObject({ kind: "connected", session: { id: "work" } });

    h.records[2]?.close({ kind: "transport", diagnostic: "socket closed after refresh" });
    await vi.waitFor(() => expect(h.records).toHaveLength(4));
    const beforeLateCallback = h.model.getState();
    const pendingAfterRefresh = h.records[3];
    if (pendingAfterRefresh === undefined) throw new Error("post-refresh attempt was not created");
    h.model.dispose();
    expect(pendingAfterRefresh.disposed).toBe(true);
    pendingAfterRefresh.settle();
    expect(h.model.getState()).toBe(beforeLateCallback);
  });

  it("rejects late listing publication after disposal and removes configuration subscription", async () => {
    const pending = deferred<Awaited<ReturnType<HerdrSessionDirectory["list"]>>>();
    const h = createHarness({ list: () => pending.promise });
    const published = vi.fn();
    h.model.onDidChange(published);
    const initialization = h.model.initialize();
    h.model.dispose();
    published.mockClear();
    pending.resolve(success());
    await initialization;
    expect(h.hasConfigurationListener()).toBe(false);
    expect(published).not.toHaveBeenCalled();
  });
});
