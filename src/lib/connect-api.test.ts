import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  workoutConnect,
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
import {
  connectFailure,
  connectProblem,
  connectSuccess,
  unwrapConnectOutcome,
} from "@mdbase-dev/connect";
import { operationsForApplicationCapabilities } from "@mdbase-dev/connect-protocol";
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
  read: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  describe: vi.fn(),
} as unknown as MdbaseConnection;

beforeAll(async () => {
  vi.spyOn(workoutConnect, "manifest").mockResolvedValue(
    connectSuccess(workoutManifest as MdbaseAppManifest),
  );
  unwrapConnectOutcome(await workoutSession.start());
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
    effective_frontmatter: frontmatter,
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
    effective_frontmatter: frontmatter,
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
      contracts: [
        contractDescriptor("exercise"),
        contractDescriptor("plan"),
        contractDescriptor("plan-template"),
        contractDescriptor("quick-log"),
        contractDescriptor("session"),
      ],
      access: "contract",
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
  unwrapConnectOutcome(
    workoutSession.select(info.collectionId, { history: "replace" }),
  );
  vi.spyOn(boundConnection, "describe").mockResolvedValue(connectSuccess({
    protocol_version: 1,
    collection_id: "workouts-test",
    display_name: "Test workouts",
    spec_version: "0.3.0",
    operations: workoutOperations,
    change_cursor: 0,
    types: [],
    contracts: [
      contractDescriptor("exercise"),
      contractDescriptor("plan"),
      contractDescriptor("plan-template"),
      contractDescriptor("quick-log"),
      contractDescriptor("session"),
    ],
  }));
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
        meta: { total_count: 1, has_more: false },
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
      limit: 20000,
    });
  });

  it("uses the canonical patch input for updates", async () => {
    const update = vi.spyOn(boundConnection, "update").mockResolvedValue(connectSuccess(recordDocument(
        "exercises/bench-press.md",
        { name: "Paused Bench Press" },
        ["exercise"],
      )));

    await connectApi.exercises.update("bench-press", { name: "Paused Bench Press" });

    expect(update).toHaveBeenCalledWith({
      path: "exercises/bench-press.md",
      patch: { name: "Paused Bench Press" },
      contract: {
        id: "mdbase.workouts.exercise",
        version: "1.0.0",
      },
    });
  });

  it("selects one exact provider when creating into a contract with several implementations", async () => {
    vi.spyOn(boundConnection, "describe").mockResolvedValue(connectSuccess({
      protocol_version: 1,
      collection_id: "workouts-test",
      display_name: "Test workouts",
      spec_version: "0.3.0",
      operations: workoutOperations,
      change_cursor: 0,
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
    });
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
        meta: { total_count: 0, has_more: false },
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

  it("keeps a cold Today startup to five contract queries", async () => {
    const query = vi.spyOn(boundConnection, "query").mockResolvedValue(connectSuccess({
        results: [],
        meta: { total_count: 0, has_more: false },
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
          meta: { total_count: 1, has_more: false },
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
        meta: { total_count: 1, has_more: false },
    }));

    await expect(staleResult).resolves.toEqual([expect.objectContaining({ name: "Stale" })]);
    await expect(freshResult).resolves.toEqual([expect.objectContaining({ name: "Fresh" })]);
    await expect(connectApi.exercises.list()).resolves.toEqual([expect.objectContaining({ name: "Fresh" })]);
    expect(query).toHaveBeenCalledTimes(2);
  });
});

function implementation(typeName: string) {
  return {
    type_name: typeName,
    type_version: 1,
    digest: `sha256:${typeName}`,
    fields: {},
  };
}

function contractDescriptor(type: string) {
  return {
    id: `mdbase.workouts.${type}`,
    contract_type: "record" as const,
    version: "1.0.0",
    digest: `sha256:${type}`,
    schema: {},
    implementations: [implementation(type)],
  };
}
