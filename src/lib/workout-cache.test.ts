import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  connectSuccess,
  unwrapConnectOutcome,
  type MdbaseAppManifest,
  type MdbaseConnectionInfo,
} from "@mdbase-dev/connect";
import { workoutConnect, workoutSession } from "./connect";
import workoutManifest from "../../public/.well-known/mdbase-app.json";
import {
  clearWorkoutCache,
  loadWorkoutCache,
  readWorkoutCache,
  writeWorkoutCache,
} from "./workout-cache";

beforeAll(async () => {
  vi.spyOn(workoutConnect, "manifest").mockResolvedValue(
    connectSuccess(workoutManifest as MdbaseAppManifest),
  );
  unwrapConnectOutcome(await workoutSession.start());
});

afterAll(() => workoutSession.destroy());

function useCollection(collectionId: string) {
  const info: MdbaseConnectionInfo = {
    collectionId,
    displayName: collectionId,
    operations: [],
    scope: { contracts: [], access: "full_collection" },
    authority: { kind: "connector", durability: "computer" },
    route: "relay",
    directAccess: "permission_required",
  };
  vi.spyOn(workoutConnect, "connections").mockReturnValue([info]);
  vi.spyOn(workoutConnect, "connection").mockReturnValue({
    collectionId,
    authorizationCapabilities: () => ({
      authorized: true,
      sufficient: true,
      grantedOperations: [],
      missingOperations: [],
    }),
    info: () => info,
    onConnectionChange: () => () => undefined,
  } as never);
  workoutSession.select(collectionId, { history: "replace" });
}

describe("workout cache", () => {
  it("keeps cached records scoped to the selected collection", () => {
    useCollection("collection-a");
    writeWorkoutCache("today", { sessions: ["a"] });
    expect(readWorkoutCache("today")?.value).toEqual({ sessions: ["a"] });

    vi.restoreAllMocks();
    useCollection("collection-b");
    expect(readWorkoutCache("today")).toBeNull();

    writeWorkoutCache("today", { sessions: ["b"] });
    clearWorkoutCache();
    expect(readWorkoutCache("today")).toBeNull();

    vi.restoreAllMocks();
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
