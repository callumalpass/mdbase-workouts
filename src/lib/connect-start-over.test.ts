import { afterEach, describe, expect, it, vi } from "vitest";
import { setWorkoutEntryForTests, startWorkoutsOver } from "./connect";

function pendingWrites(details: number) {
  return Object.assign(new Error("changes haven't reached mdbase"), {
    code: "conflict",
    reason: "sign_out_pending_writes",
    details,
  });
}

describe("starting the workout connection over", () => {
  afterEach(() => setWorkoutEntryForTests(null));

  it("signs out when nothing is waiting to sync", async () => {
    const signOut = vi.fn(async () => ({}));
    setWorkoutEntryForTests({ signOut } as never);
    const confirm = vi.fn(() => true);

    await expect(startWorkoutsOver(confirm)).resolves.toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks before discarding unsynced changes", async () => {
    const signOut = vi.fn()
      .mockRejectedValueOnce(pendingWrites(2))
      .mockResolvedValueOnce({});
    setWorkoutEntryForTests({ signOut } as never);
    const confirm = vi.fn(() => true);

    await expect(startWorkoutsOver(confirm)).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith(2);
    expect(signOut).toHaveBeenLastCalledWith({ discard: true });
  });

  it("keeps everything when the person says no", async () => {
    const signOut = vi.fn().mockRejectedValueOnce(pendingWrites(1));
    setWorkoutEntryForTests({ signOut } as never);

    await expect(startWorkoutsOver(() => false)).resolves.toBe(false);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("passes other failures on", async () => {
    const signOut = vi.fn().mockRejectedValueOnce(new Error("offline"));
    setWorkoutEntryForTests({ signOut } as never);

    await expect(startWorkoutsOver(() => true)).rejects.toThrow("offline");
  });
});
