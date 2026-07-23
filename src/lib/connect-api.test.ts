import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, workoutOperations } from "./connect";
import { connectApi, invalidateConnectApiCache } from "./connect-api";

beforeEach(() => {
  invalidateConnectApiCache();
  vi.spyOn(connect, "connection").mockReturnValue({
    collectionId: "workouts-test",
    operations: workoutOperations,
    scope: { contracts: [] },
    route: "relay",
    directAccess: "permission_required",
  });
});

afterEach(() => vi.restoreAllMocks());

describe("Connect workout API", () => {
  it("unwraps query envelopes into workout records", async () => {
    vi.spyOn(connect, "query").mockResolvedValue({
      valid: true,
      diagnostics: [],
      result: {
        results: [{
          path: "exercises/bench-press.md",
          frontmatter: {
            type: "exercise",
            name: "Bench Press",
            muscle_groups: ["chest"],
            equipment: "barbell",
            tracking: "weight_reps",
          },
          types: ["exercise"],
        }],
        meta: { total_count: 1, has_more: false },
      },
    });

    await expect(connectApi.exercises.list()).resolves.toEqual([expect.objectContaining({
      path: "exercises/bench-press.md",
      name: "Bench Press",
    })]);
  });

  it("uses the canonical patch input for updates", async () => {
    const update = vi.spyOn(connect, "update").mockResolvedValue({
      valid: true,
      diagnostics: [],
      result: {
        path: "exercises/bench-press.md",
        revision: "revision-2",
        frontmatter: { name: "Paused Bench Press" },
        types: ["exercise"],
      },
    });

    await connectApi.exercises.update("bench-press", { name: "Paused Bench Press" });

    expect(update).toHaveBeenCalledWith({
      path: "exercises/bench-press.md",
      patch: { name: "Paused Bench Press" },
    });
  });

  it("surfaces collection diagnostics", async () => {
    vi.spyOn(connect, "query").mockResolvedValue({
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
    const query = vi.spyOn(connect, "query").mockResolvedValue({
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
    const query = vi.spyOn(connect, "query").mockResolvedValue({
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
    let resolveStale!: (value: Awaited<ReturnType<typeof connect.query>>) => void;
    const stale = new Promise<Awaited<ReturnType<typeof connect.query>>>((done) => {
      resolveStale = done;
    });
    const query = vi.spyOn(connect, "query")
      .mockImplementationOnce(() => stale)
      .mockResolvedValue({
        valid: true,
        diagnostics: [],
        result: {
          results: [{
            path: "exercises/fresh.md",
            frontmatter: { name: "Fresh" },
            types: ["exercise"],
          }],
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
        results: [{
          path: "exercises/stale.md",
          frontmatter: { name: "Stale" },
          types: ["exercise"],
        }],
        meta: { total_count: 1, has_more: false },
      },
    });

    await expect(staleResult).resolves.toEqual([expect.objectContaining({ name: "Stale" })]);
    await expect(freshResult).resolves.toEqual([expect.objectContaining({ name: "Fresh" })]);
    await expect(connectApi.exercises.list()).resolves.toEqual([expect.objectContaining({ name: "Fresh" })]);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
