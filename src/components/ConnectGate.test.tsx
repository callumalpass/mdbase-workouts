import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const gateway = vi.hoisted(() => {
  const snapshot = {
    status: "unavailable" as const,
    collectionId: "stale-workouts",
    reason: "not_authorized" as const,
    connections: [
      {
        collectionId: "remembered-workouts",
        displayName: "Remembered workouts",
        operations: [],
        scope: { contracts: [], access: "full_collection" as const },
        route: "relay" as const,
        directAccess: "permission_required" as const,
      },
    ],
  };
  return {
    authorize: vi.fn(() => new Promise<never>(() => undefined)),
    select: vi.fn(),
    start: vi.fn().mockResolvedValue(snapshot),
    snapshot,
  };
});

vi.mock("../lib/connect", () => ({
  connectErrorMessage: vi.fn((reason: unknown) => String(reason)),
  connectIsRequired: vi.fn(() => true),
  requireWorkoutConnection: vi.fn(),
  subscribeToWorkoutSession: vi.fn(() => () => undefined),
  workoutSession: {
    authorize: gateway.authorize,
    select: gateway.select,
    start: gateway.start,
  },
  workoutSnapshot: vi.fn(() => gateway.snapshot),
}));

import ConnectGate from "./ConnectGate";

beforeEach(() => {
  gateway.authorize.mockClear();
  gateway.select.mockClear();
  gateway.start.mockClear();
});

it("connects another collection without pinning the stale selection", async () => {
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  fireEvent.click(
    await screen.findByRole("button", { name: "Connect another collection" }),
  );

  expect(gateway.authorize).toHaveBeenCalledWith("choose");
});

it("opens a remembered collection through the session without reloading", async () => {
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  fireEvent.click(
    await screen.findByRole("button", { name: /Remembered workouts/ }),
  );

  expect(gateway.select).toHaveBeenCalledWith("remembered-workouts", {
    history: "replace",
  });
});
