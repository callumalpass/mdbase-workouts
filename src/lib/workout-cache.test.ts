import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mdbase } from "@mdbase-dev/sdk";
import { setWorkoutEntryForTests } from "./connect";
import {
  clearWorkoutCache,
  loadWorkoutCache,
  readWorkoutCache,
  writeWorkoutCache,
} from "./workout-cache";

function useCollection(collectionId: string) {
  setWorkoutEntryForTests({
    getSnapshot: () => ({ phase: { kind: "ready", collectionId } }),
  } as unknown as Mdbase);
}

afterEach(() => {
  localStorage.clear();
  clearWorkoutCache();
});

describe("workout cache", () => {
  it("keeps cached records scoped to the selected collection", () => {
    useCollection("collection-a");
    writeWorkoutCache("today", { sessions: ["a"] });
    expect(readWorkoutCache("today")?.value).toEqual({ sessions: ["a"] });

    useCollection("collection-b");
    expect(readWorkoutCache("today")).toBeNull();

    writeWorkoutCache("today", { sessions: ["b"] });
    clearWorkoutCache();
    expect(readWorkoutCache("today")).toBeNull();

    useCollection("collection-a");
    expect(readWorkoutCache("today")?.value).toEqual({ sessions: ["a"] });
  });

  it("coalesces concurrent refreshes", async () => {
    useCollection("collection-a");
    let resolve!: (value: string) => void;
    const request = new Promise<string>((done) => { resolve = done; });
    const load = vi.fn(() => request);

    const first = loadWorkoutCache("stats", load);
    const second = loadWorkoutCache("stats", load);
    resolve("fresh");

    await expect(Promise.all([first, second])).resolves.toEqual(["fresh", "fresh"]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(readWorkoutCache("stats")?.value).toBe("fresh");
  });

  it("does not persist oversized snapshots", () => {
    useCollection("collection-a");
    writeWorkoutCache("large", "x".repeat(400_000));
    expect(readWorkoutCache("large")).toBeNull();
  });

  it("does not restore an invalidated request after a write", async () => {
    useCollection("collection-a");
    let resolveStale!: (value: string) => void;
    let resolveFresh!: (value: string) => void;
    const stale = loadWorkoutCache("today", () => new Promise<string>((done) => { resolveStale = done; }));

    clearWorkoutCache();
    const freshLoad = vi.fn(() => new Promise<string>((done) => { resolveFresh = done; }));
    const fresh = loadWorkoutCache("today", freshLoad);
    resolveStale("stale");
    await stale;
    const duplicate = loadWorkoutCache("today", freshLoad);
    expect(freshLoad).toHaveBeenCalledTimes(1);
    resolveFresh("fresh");
    await expect(Promise.all([fresh, duplicate])).resolves.toEqual(["fresh", "fresh"]);

    expect(readWorkoutCache("today")?.value).toBe("fresh");
  });
});
