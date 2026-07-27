import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, workoutOperations } from "./connect";
import { connectApi, invalidateConnectApiCache } from "./connect-api";
import type {
  JsonObject,
  MdbaseConnection,
  MdbaseConnectionInfo,
  QueryRecord,
  RecordDocument,
} from "@mdbase/connect";

const boundConnection = {
  info: vi.fn(),
  query: vi.fn(),
  read: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  describe: vi.fn(),
} as unknown as MdbaseConnection;

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
    scope: { contracts: [], access: "full_collection" },
    route: "relay",
    directAccess: "permission_required",
  };
  Object.defineProperty(boundConnection, "collectionId", {
    configurable: true,
    value: info.collectionId,
  });
  vi.spyOn(boundConnection, "info").mockReturnValue(info);
  vi.spyOn(connect, "connections").mockReturnValue([info]);
  vi.spyOn(connect, "connection").mockReturnValue(boundConnection);
});

afterEach(() => vi.restoreAllMocks());

describe("Connect workout API", () => {
  it("unwraps query envelopes into workout records", async () => {
    vi.spyOn(boundConnection, "query").mockResolvedValue({
      valid: true,
      diagnostics: [],
      result: {
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
      },
    });

    await expect(connectApi.exercises.list()).resolves.toEqual([expect.objectContaining({
      path: "exercises/bench-press.md",
      name: "Bench Press",
    })]);
  });

  it("uses the canonical patch input for updates", async () => {
    const update = vi.spyOn(boundConnection, "update").mockResolvedValue({
      valid: true,
      diagnostics: [],
      result: recordDocument(
        "exercises/bench-press.md",
        { name: "Paused Bench Press" },
        ["exercise"],
      ),
    });

    await connectApi.exercises.update("bench-press", { name: "Paused Bench Press" });

    expect(update).toHaveBeenCalledWith({
      path: "exercises/bench-press.md",
      patch: { name: "Paused Bench Press" },
    });
  });

  it("surfaces collection diagnostics", async () => {
    vi.spyOn(boundConnection, "query").mockResolvedValue({
      valid: false,
      result: { results: [], meta: { total_count: 0, has_more: false } },
      diagnostics: [{
        severity: "error",
        code: "invalid_query",
        message: "The workout query is not valid.",
      }],
    });

    await expect(connectApi.exercises.list()).rejects.toThrow("The workout query is not valid.");
  });

  it("shares collection scans between dashboard stats", async () => {
    const query = vi.spyOn(boundConnection, "query").mockResolvedValue({
      valid: true,
      diagnostics: [],
      result: {
        results: [],
        meta: { total_count: 0, has_more: false },
      },
    });

    await Promise.all([
      connectApi.stats.get("Australia/Melbourne"),
      connectApi.stats.weekly("Australia/Melbourne"),
    ]);

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.map(([input]) => input?.types?.[0]).sort()).toEqual([
      "exercise",
      "quick-log",
      "session",
    ]);
  });

  it("keeps a cold Today startup to seven collection operations", async () => {
    const query = vi.spyOn(boundConnection, "query").mockResolvedValue({
      valid: true,
      diagnostics: [],
      result: {
        results: [],
        meta: { total_count: 0, has_more: false },
      },
    });

    await Promise.all([
      connectApi.today("Australia/Melbourne"),
      connectApi.exercises.list(),
      connectApi.stats.get("Australia/Melbourne"),
      connectApi.stats.weekly("Australia/Melbourne"),
    ]);

    expect(query).toHaveBeenCalledTimes(7);
  });

  it("does not let an invalidated source request replace fresh rows", async () => {
    let resolveStale!: (value: Awaited<ReturnType<typeof boundConnection.query>>) => void;
    const stale = new Promise<Awaited<ReturnType<typeof boundConnection.query>>>((done) => {
      resolveStale = done;
    });
    const query = vi.spyOn(boundConnection, "query")
      .mockImplementationOnce(() => stale)
      .mockResolvedValue({
        valid: true,
        diagnostics: [],
        result: {
          results: [queryRecord(
            "exercises/fresh.md",
            { name: "Fresh" },
            ["exercise"],
          )],
          meta: { total_count: 1, has_more: false },
        },
      });

    const staleResult = connectApi.exercises.list();
    invalidateConnectApiCache();
    const freshResult = connectApi.exercises.list();
    resolveStale({
      valid: true,
      diagnostics: [],
      result: {
        results: [queryRecord(
          "exercises/stale.md",
          { name: "Stale" },
          ["exercise"],
        )],
        meta: { total_count: 1, has_more: false },
      },
    });

    await expect(staleResult).resolves.toEqual([expect.objectContaining({ name: "Stale" })]);
    await expect(freshResult).resolves.toEqual([expect.objectContaining({ name: "Fresh" })]);
    await expect(connectApi.exercises.list()).resolves.toEqual([expect.objectContaining({ name: "Fresh" })]);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
