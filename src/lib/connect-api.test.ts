import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, workoutOperations } from "./connect";
import { connectApi } from "./connect-api";

beforeEach(() => {
  vi.spyOn(connect, "connection").mockReturnValue({
    collectionId: "workouts-test",
    operations: workoutOperations,
    scope: { contracts: [] },
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
});
