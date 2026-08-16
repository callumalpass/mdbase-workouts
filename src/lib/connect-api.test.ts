import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recoverWorkoutPendingMutation,
  refreshWorkoutPendingMutation,
  workoutConnect,
  workoutPendingMutationSnapshot,
  workoutSession,
} from "./connect";
import { connectApi, invalidateConnectApiCache } from "./connect-api";
import type {
  JsonObject,
  MdbaseConnection,
  MdbaseConnectionInfo,
  MdbaseAppManifest,
  QueryRecord,
  RecordDocument,
} from "@mdbase-dev/connect";
import { connectFailure, connectProblem, connectSuccess } from "@mdbase-dev/connect-testing";
import { operationsForApplicationCapabilities } from "@mdbase-dev/connect-protocol";
import { requireConnectOutcome } from "./connect-outcome";
import workoutManifest from "../../public/.well-known/mdbase-app.json";

const workoutOperations = operationsForApplicationCapabilities({
  contract_version: 1,
  required: [
    "collection.inspect",
    "records.read",
    "records.query",
    "records.create",
    "records.update",
    "records.delete",
    "definitions.contracts.current",
    "collection.setup.apply",
  ],
});

const boundConnection = {
  authorizationCapabilities: vi.fn(() => ({
    authorized: true,
    sufficient: true,
    grantedOperations: workoutOperations,
    missingOperations: [],
  })),
  onConnectionChange: vi.fn(() => () => undefined),
  info: vi.fn(),
  query: vi.fn(),
  queryPages: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  describe: vi.fn(),
  assessCollectionSetup: vi.fn(async () => connectSuccess({
    status: "current",
    applicable: true,
    typePacks: [],
  } as never)),
  applyCollectionSetup: vi.fn(),
  assessTypePack: vi.fn(async () => connectSuccess({ status: "current" } as never)),
  applyTypePack: vi.fn(),
  pendingMutation: vi.fn(),
  pendingMutations: vi.fn(() => []),
} as unknown as MdbaseConnection;

beforeAll(async () => {
  vi.spyOn(workoutConnect, "register").mockResolvedValue(connectSuccess({
    id: "workouts-test-application",
    family_identity: "bundle:dev.mdbase.workouts",
    manifest_digest: "0".repeat(64),
    name: "MDBase Workouts",
    homepage: "https://callumalpass.github.io/mdbase-workouts/",
    requirements: workoutManifest.requirements as NonNullable<MdbaseAppManifest["requirements"]>,
  }));
  vi.spyOn(workoutConnect, "manifest").mockResolvedValue(
    connectSuccess(workoutManifest as MdbaseAppManifest),
  );
  requireConnectOutcome(await workoutSession.start());
});

afterAll(() => workoutSession.destroy());

function queryRecord(
  path: string,
  frontmatter: JsonObject,
  types: string[],
): QueryRecord<JsonObject> & JsonObject {
  const slash = path.lastIndexOf("/");
  return {
    path,
    frontmatter,
    effectiveFrontmatter: frontmatter,
    types,
    file: {
      path,
      name: path.slice(slash + 1),
      folder: slash < 0 ? "" : path.slice(0, slash),
      size: 100,
      mtime: "2026-07-27T00:00:00.000Z",
    },
  } as QueryRecord<JsonObject> & JsonObject;
}

function recordDocument(
  path: string,
  frontmatter: JsonObject,
  types: string[],
): RecordDocument<JsonObject> {
  const { file } = queryRecord(path, frontmatter, types);
  return {
    path,
    revision: "revision-2",
    frontmatter,
    effectiveFrontmatter: frontmatter,
    types,
    body: "",
    file,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateConnectApiCache();
  const info: MdbaseConnectionInfo = {
    collectionId: "workouts-test",
    displayName: "Test workouts",
    operations: workoutOperations,
    scope: {
      contracts: [],
      access: "full_collection",
    },
    route: "relay",
    authority: { kind: "connector", durability: "computer" },
    directAccess: "permission_required",
  };
  Object.defineProperty(boundConnection, "collectionId", {
    configurable: true,
    value: info.collectionId,
  });
  vi.spyOn(boundConnection, "info").mockReturnValue(info);
  vi.spyOn(workoutConnect, "connections").mockReturnValue([info]);
  vi.spyOn(workoutConnect, "connection").mockReturnValue(boundConnection);
  requireConnectOutcome(
    workoutSession.select(info.collectionId, { history: "replace" }),
  );
  vi.spyOn(boundConnection, "describe").mockResolvedValue(connectSuccess({
    protocolVersion: 1,
    collectionId: "workouts-test",
    displayName: "Test workouts",
    specVersion: "0.3.0",
    operations: workoutOperations,
    changeCursor: 0,
    types: [],
    contracts: [
      contractDescriptor("exercise"),
      contractDescriptor("plan"),
      contractDescriptor("plan-template"),
      contractDescriptor("quick-log"),
      contractDescriptor("session"),
    ],
  }));
  vi.spyOn(boundConnection, "pendingMutations").mockReturnValue([]);
  vi.spyOn(boundConnection, "read").mockImplementation(async (input) =>
    connectSuccess(recordDocument(input.path, {}, []))
  );
  vi.spyOn(boundConnection, "queryPages").mockImplementation((input, options) =>
    (async function* () {
      const outcome = await boundConnection.query(input, {
        timeoutMs: options?.pageTimeoutMs,
      });
      if (!outcome.ok) {
        yield outcome as never;
        return;
      }
      yield connectSuccess({
        results: outcome.value.results,
        meta: outcome.value.meta,
        page: 0,
        offset: 0,
        loaded: outcome.value.results.length,
        complete: !(outcome.value.meta?.hasMore ?? false),
      });
    })()
  );
  refreshWorkoutPendingMutation();
});

afterEach(() => {
  workoutSession.clearSelection({ history: "replace" });
  vi.restoreAllMocks();
});

describe("Connect workout API", () => {
  it("unwraps query envelopes into workout records", async () => {
    vi.spyOn(boundConnection, "query").mockResolvedValue(connectSuccess({
        results: [queryRecord(
          "exercises/bench-press.md",
          {
            type: "exercise",
            name: "Bench Press",
            muscle_groups: ["chest"],
            equipment: "barbell",
            tracking: "weight_reps",
          },
          ["exercise"],
        )],
        meta: { totalCount: 1, hasMore: false },
    }));

    await expect(connectApi.exercises.list()).resolves.toEqual([expect.objectContaining({
      path: "exercises/bench-press.md",
      name: "Bench Press",
    })]);
    expect(boundConnection.query).toHaveBeenCalledWith({
      contract: {
        id: "mdbase.workouts.exercise",
        version: "1.0.0",
      },
    }, { timeoutMs: 10_000 });
    expect(boundConnection.queryPages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        firstPageSize: 500,
        pageSize: 500,
        pageTimeoutMs: 10_000,
      }),
    );
  });

  it("loads every contract result through bounded opaque pages", async () => {
    vi.spyOn(boundConnection, "query").mockRejectedValue(
      new Error("one-shot query must not be used"),
    );
    vi.spyOn(boundConnection, "queryPages").mockImplementation(() =>
      (async function* () {
        yield connectSuccess({
          results: [queryRecord("exercises/alpha.md", { name: "Alpha" }, ["exercise"])],
          meta: { totalCount: 2, hasMore: true, cursor: "opaque-next" },
          page: 0,
          offset: 0,
          loaded: 1,
          complete: false,
          cursor: "opaque-next",
        });
        yield connectSuccess({
          results: [queryRecord("exercises/beta.md", { name: "Beta" }, ["exercise"])],
          meta: { totalCount: 2, hasMore: false },
          page: 1,
          offset: 1,
          loaded: 2,
          complete: true,
        });
      })(),
    );

    await expect(connectApi.exercises.list()).resolves.toEqual([
      expect.objectContaining({ name: "Alpha" }),
      expect.objectContaining({ name: "Beta" }),
    ]);
    expect(boundConnection.query).not.toHaveBeenCalled();
  });

  it("uses the canonical patch input for updates", async () => {
    const update = vi.spyOn(boundConnection, "update").mockResolvedValue(connectSuccess(recordDocument(
        "exercises/bench-press.md",
        { name: "Paused Bench Press" },
        ["exercise"],
      )));

    await expect(
      connectApi.exercises.update("bench-press", {
        name: "Paused Bench Press",
        path: "frontmatter-must-not-override.md",
        revision: "frontmatter-must-not-override",
      } as never),
    ).resolves.toMatchObject({
      path: "exercises/bench-press.md",
      revision: "revision-2",
    });

    expect(update).toHaveBeenCalledWith({
      path: "exercises/bench-press.md",
      patch: { name: "Paused Bench Press" },
      ifRevision: "revision-2",
      contract: {
        id: "mdbase.workouts.exercise",
        version: "1.0.0",
      },
    }, { timeoutMs: 20_000 });
    expect(boundConnection.read).toHaveBeenCalledWith(
      {
        path: "exercises/bench-press.md",
        contract: { id: "mdbase.workouts.exercise", version: "1.0.0" },
      },
      { timeoutMs: 10_000 },
    );
  });

  it("revision-guards deletes with a fresh exact point read", async () => {
    const remove = vi.spyOn(boundConnection, "delete").mockResolvedValue(
      connectSuccess({ path: "sessions/session-1.md", deleted: true }),
    );

    await connectApi.sessions.delete("session-1");

    expect(remove).toHaveBeenCalledWith(
      {
        path: "sessions/session-1.md",
        ifRevision: "revision-2",
        contract: { id: "mdbase.workouts.session", version: "1.0.0" },
      },
      { timeoutMs: 20_000 },
    );
  });

  it("selects one exact provider when creating into a contract with several implementations", async () => {
    vi.spyOn(boundConnection, "describe").mockResolvedValue(connectSuccess({
      protocolVersion: 1,
      collectionId: "workouts-test",
      displayName: "Test workouts",
      specVersion: "0.3.0",
      operations: workoutOperations,
      changeCursor: 0,
      types: [],
      contracts: [{
        ...contractDescriptor("exercise"),
        implementations: [
          implementation("strength-exercise"),
          implementation("exercise"),
        ],
      }],
    }));
    const create = vi.spyOn(boundConnection, "create").mockResolvedValue(connectSuccess(recordDocument(
        "exercises/bench-press.md",
        { name: "Bench Press" },
        ["exercise"],
      )));

    await connectApi.exercises.create({
      name: "Bench Press",
      muscle_groups: ["chest"],
      equipment: "barbell",
      tracking: "weight_reps",
    });

    expect(create).toHaveBeenCalledWith({
      path: "exercises/bench-press.md",
      frontmatter: {
        name: "Bench Press",
        muscle_groups: ["chest"],
        equipment: "barbell",
        tracking: "weight_reps",
      },
      contract: {
        id: "mdbase.workouts.exercise",
        version: "1.0.0",
        type: "exercise",
      },
    }, { timeoutMs: 20_000 });
  });

  it("surfaces collection diagnostics", async () => {
    vi.spyOn(boundConnection, "query").mockResolvedValue(connectFailure(
      connectProblem("operation_invalid", "The workout query is not valid.", {
        details: {
          diagnostics: [{
            severity: "error",
            code: "invalid_query",
            message: "The workout query is not valid.",
          }],
        },
      }),
    ));

    await expect(connectApi.exercises.list()).rejects.toThrow("The workout query is not valid.");
  });

  it("shares collection scans between dashboard stats", async () => {
    const query = vi.spyOn(boundConnection, "query").mockResolvedValue(connectSuccess({
        results: [],
        meta: { totalCount: 0, hasMore: false },
    }));

    await Promise.all([
      connectApi.stats.get("Australia/Melbourne"),
      connectApi.stats.weekly("Australia/Melbourne"),
    ]);

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.map(([input]) => input?.contract?.id).sort()).toEqual([
      "mdbase.workouts.exercise",
      "mdbase.workouts.quick-log",
      "mdbase.workouts.session",
    ]);
  });

  it("lets one view cancel without aborting a shared bounded collection scan", async () => {
    let resolveQuery!: (value: Awaited<ReturnType<typeof boundConnection.query>>) => void;
    const pendingQuery = new Promise<Awaited<ReturnType<typeof boundConnection.query>>>((resolve) => {
      resolveQuery = resolve;
    });
    const query = vi.spyOn(boundConnection, "query").mockReturnValue(pendingQuery);
    const first = new AbortController();
    const second = new AbortController();

    const cancelled = connectApi.exercises.list({ signal: first.signal });
    const retained = connectApi.exercises.list({ signal: second.signal });
    first.abort("Exercise list closed");
    resolveQuery(connectSuccess({
      results: [queryRecord("exercises/bench-press.md", { name: "Bench Press" }, ["exercise"])],
      meta: { totalCount: 1, hasMore: false },
    }));

    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    await expect(retained).resolves.toEqual([expect.objectContaining({ name: "Bench Press" })]);
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.anything(), { timeoutMs: 10_000 });
  });

  it("cancels the shared cursor scan when its final caller leaves", async () => {
    let scanSignal: AbortSignal | undefined;
    vi.spyOn(boundConnection, "queryPages").mockImplementation((_input, options) =>
      (async function* () {
        scanSignal = options?.signal;
        await new Promise<void>((_resolve, reject) => {
          scanSignal?.addEventListener(
            "abort",
            () => reject(scanSignal?.reason),
            { once: true },
          );
        });
      })(),
    );
    const first = new AbortController();
    const second = new AbortController();

    const firstRequest = connectApi.exercises.list({ signal: first.signal });
    const secondRequest = connectApi.exercises.list({ signal: second.signal });
    await vi.waitFor(() => expect(scanSignal).toBeDefined());
    first.abort("First view closed");
    expect(scanSignal?.aborted).toBe(false);
    second.abort("Second view closed");

    await expect(firstRequest).rejects.toMatchObject({ name: "AbortError" });
    await expect(secondRequest).rejects.toMatchObject({ name: "AbortError" });
    expect(scanSignal?.aborted).toBe(true);
  });

  it("keeps a cold Today startup to five contract queries", async () => {
    const query = vi.spyOn(boundConnection, "query").mockResolvedValue(connectSuccess({
        results: [],
        meta: { totalCount: 0, hasMore: false },
    }));

    await Promise.all([
      connectApi.today("Australia/Melbourne"),
      connectApi.exercises.list(),
      connectApi.stats.get("Australia/Melbourne"),
      connectApi.stats.weekly("Australia/Melbourne"),
    ]);

    expect(query).toHaveBeenCalledTimes(5);
    expect(
      new Set(query.mock.calls.map(([input]) => input?.contract?.id)),
    ).toEqual(
      new Set([
        "mdbase.workouts.exercise",
        "mdbase.workouts.plan",
        "mdbase.workouts.plan-template",
        "mdbase.workouts.quick-log",
        "mdbase.workouts.session",
      ]),
    );
  });

  it("does not let an invalidated source request replace fresh rows", async () => {
    let resolveStale!: (value: Awaited<ReturnType<typeof boundConnection.query>>) => void;
    const stale = new Promise<Awaited<ReturnType<typeof boundConnection.query>>>((done) => {
      resolveStale = done;
    });
    const query = vi.spyOn(boundConnection, "query")
      .mockImplementationOnce(() => stale)
      .mockResolvedValue(connectSuccess({
          results: [queryRecord(
            "exercises/fresh.md",
            { name: "Fresh" },
            ["exercise"],
          )],
          meta: { totalCount: 1, hasMore: false },
      }));

    const staleResult = connectApi.exercises.list();
    invalidateConnectApiCache();
    const freshResult = connectApi.exercises.list();
    resolveStale(connectSuccess({
        results: [queryRecord(
          "exercises/stale.md",
          { name: "Stale" },
          ["exercise"],
        )],
        meta: { totalCount: 1, hasMore: false },
    }));

    await expect(staleResult).resolves.toEqual([expect.objectContaining({ name: "Stale" })]);
    await expect(freshResult).resolves.toEqual([expect.objectContaining({ name: "Fresh" })]);
    await expect(connectApi.exercises.list()).resolves.toEqual([expect.objectContaining({ name: "Fresh" })]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("recovers a response-lost write by its exact durable request ID", async () => {
    const requestId = "workout-write-request";
    let recovered = false;
    const recover = vi.fn(async () => {
      recovered = true;
      return connectSuccess(recordDocument(
        "exercises/bench-press.md",
        { name: "Paused Bench Press" },
        ["exercise"],
      ));
    });
    vi.spyOn(boundConnection, "pendingMutation").mockImplementation((candidate) =>
      candidate === requestId ? ({
        requestId,
        operation: "update",
        fingerprint: "fingerprint",
        status: "outcome_unknown",
        createdAt: new Date().toISOString(),
        recover,
      } as never) : null);
    vi.spyOn(boundConnection, "pendingMutations").mockImplementation(() => recovered ? [] : ([{
      requestId,
      operation: "update",
      fingerprint: "fingerprint",
      status: "outcome_unknown",
      createdAt: new Date().toISOString(),
      recover,
    }] as never));
    const update = vi.spyOn(boundConnection, "update").mockResolvedValue(connectFailure(connectProblem(
      "operation_outcome_unknown",
      "The workout write may have completed.",
      { operationOutcome: "unknown", details: { request_id: requestId } },
    )));

    await expect(connectApi.exercises.update("bench-press", { name: "Paused Bench Press" }))
      .rejects.toMatchObject({ problem: { details: { request_id: requestId } } });
    expect(workoutPendingMutationSnapshot()).toEqual({ requestId, operation: "update" });

    await recoverWorkoutPendingMutation();
    expect(update).toHaveBeenCalledOnce();
    expect(recover).toHaveBeenCalledWith({ timeoutMs: 20_000 });
    expect(workoutPendingMutationSnapshot()).toBeNull();
  });
});

function implementation(typeName: string) {
  return {
    typeName: typeName,
    typeVersion: 1,
    digest: `sha256:${typeName}`,
    fields: {},
  };
}

function contractDescriptor(type: string) {
  return {
    id: `mdbase.workouts.${type}`,
    contractType: "record" as const,
    version: "1.0.0",
    digest: `sha256:${type}`,
    schema: {},
    implementations: [implementation(type)],
  };
}
