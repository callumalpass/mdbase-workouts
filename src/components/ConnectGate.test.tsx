import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const gateway = vi.hoisted(() => {
  const unavailableSnapshot = {
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
    applySetup: vi.fn(),
    authorize: vi.fn(() => new Promise<never>(() => undefined)),
    pending: null as Record<string, unknown> | null,
    recover: vi.fn(),
    select: vi.fn(() => ({ ok: true, value: {} })),
    start: vi.fn().mockResolvedValue({ ok: true, value: {} }),
    startupFailure: null as unknown,
    snapshot: unavailableSnapshot as Record<string, unknown>,
    unavailableSnapshot,
  };
});

vi.mock("../lib/connect", () => ({
  applyWorkoutCollectionSetup: gateway.applySetup,
  authorizeWorkoutCollection: gateway.authorize,
  connectErrorMessage: vi.fn((reason: unknown) => {
    const value = reason as { problem?: { message?: string }; message?: string };
    return value?.problem?.message ?? value?.message ?? String(reason);
  }),
  connectIsRequired: vi.fn(() => true),
  recoverWorkoutPendingMutation: gateway.recover,
  refreshWorkoutPendingMutation: vi.fn(),
  selectWorkoutCollection: gateway.select,
  setWorkoutStartupFailure: vi.fn((failure: unknown) => { gateway.startupFailure = failure; }),
  subscribeToWorkoutMutationBusy: vi.fn(() => () => undefined),
  subscribeToWorkoutPendingMutation: vi.fn(() => () => undefined),
  subscribeToWorkoutStartupFailure: vi.fn(() => () => undefined),
  requireWorkoutConnection: vi.fn(),
  subscribeToWorkoutSession: vi.fn(() => () => undefined),
  workoutSession: {
    authorize: gateway.authorize,
    select: gateway.select,
    start: gateway.start,
  },
  workoutPendingMutationSnapshot: vi.fn(() => gateway.pending),
  workoutMutationBusySnapshot: vi.fn(() => false),
  workoutSnapshot: vi.fn(() => gateway.snapshot),
  workoutStartupFailureSnapshot: vi.fn(() => gateway.startupFailure),
}));

import ConnectGate from "./ConnectGate";

beforeEach(() => {
  gateway.snapshot = gateway.unavailableSnapshot;
  gateway.pending = null;
  gateway.startupFailure = null;
  gateway.authorize.mockClear();
  gateway.select.mockClear();
  gateway.start.mockClear();
  gateway.applySetup.mockClear();
  gateway.recover.mockClear();
});

it("connects another collection without pinning the stale selection", async () => {
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  fireEvent.click(
    await screen.findByRole("button", { name: "Connect another collection" }),
  );

  expect(gateway.authorize).toHaveBeenCalledWith("choose", {
    signal: expect.any(AbortSignal),
    timeoutMs: 15_000,
  });
});

it("opens a remembered collection through the session without reloading", async () => {
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  fireEvent.click(
    await screen.findByRole("button", { name: /Remembered workouts/ }),
  );

  expect(gateway.select).toHaveBeenCalledWith("remembered-workouts");
});

it("requires explicit selected-collection authorization for declaration changes", async () => {
  gateway.snapshot = {
    ...gateway.unavailableSnapshot,
    status: "authorization_required",
    collectionId: "remembered-workouts",
    info: gateway.unavailableSnapshot.connections[0],
    capabilities: {},
  };
  gateway.pending = {
    collectionId: "remembered-workouts",
    requestId: "preserved-write",
    operation: "update",
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.queryByRole("button", { name: /Remembered workouts/ })).not.toBeInTheDocument();
  const review = screen.getByRole("button", { name: "Review updated access" });
  expect(review).toBeEnabled();
  fireEvent.click(review);

  expect(gateway.authorize).toHaveBeenCalledWith("selected", {
    signal: expect.any(AbortSignal),
    timeoutMs: 15_000,
  });
});

it("retries a failed start and does not expose collection actions first", async () => {
  gateway.snapshot = {
    status: "start_failed",
    problem: { code: "temporarily_unavailable", message: "Registration is unavailable." },
    connections: gateway.unavailableSnapshot.connections,
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.queryByRole("button", { name: /Remembered workouts/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));

  expect(gateway.start).toHaveBeenCalledWith({ timeoutMs: 15_000 });
  expect(gateway.authorize).not.toHaveBeenCalled();
  expect(gateway.select).not.toHaveBeenCalled();
});

it("treats a destroyed session as terminal", () => {
  gateway.snapshot = { status: "destroyed", connections: [] };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByRole("alert")).toHaveTextContent("session has ended");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("renders a preserved startup timeout and keeps retry available", () => {
  gateway.snapshot = {
    status: "not_started",
    connections: gateway.unavailableSnapshot.connections,
  };
  gateway.startupFailure = {
    problem: { code: "timeout", message: "Startup exceeded its request budget." },
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByRole("alert")).toHaveTextContent("Startup exceeded its request budget.");
  expect(screen.getByRole("button", { name: "Retry connection" })).toBeEnabled();
});

it("offers exact setup recovery and blocks setup resubmission while it is pending", () => {
  gateway.snapshot = {
    ...gateway.unavailableSnapshot,
    status: "setup_review_required",
    collectionId: "remembered-workouts",
    info: gateway.unavailableSnapshot.connections[0],
    capabilities: {},
    update: { canApply: true, typePacks: [] },
  };
  gateway.pending = {
    collectionId: "remembered-workouts",
    requestId: "setup-request-1",
    operation: "apply_collection_setup",
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByText("setup-request-1")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Recover setup change" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Apply workout definitions" })).toBeDisabled();
  expect(gateway.applySetup).not.toHaveBeenCalled();
});
