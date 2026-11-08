import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const gateway = vi.hoisted(() => {
  const collection = {
    collectionId: "remembered-workouts",
    displayName: "Remembered workouts",
    role: "owner" as const,
  };
  return {
    applySetup: vi.fn(),
    authorize: vi.fn(),
    connection: null as Record<string, unknown> | null,
    pending: null as Record<string, unknown> | null,
    recover: vi.fn(),
    select: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    startupFailure: null as unknown,
    snapshot: {
      phase: { kind: "choosing", lastApproval: null },
      collections: [collection],
    } as Record<string, unknown>,
    collections: [collection],
  };
});

vi.mock("../lib/connect", () => ({
  applyWorkoutCollectionSetup: gateway.applySetup,
  authorizeWorkoutCollection: gateway.authorize,
  connectErrorMessage: vi.fn((reason: unknown) => {
    const value = reason as { message?: string };
    return value?.message ?? String(reason);
  }),
  connectIsRequired: vi.fn(() => true),
  recoverWorkoutPendingMutation: gateway.recover,
  refreshWorkoutPendingMutation: vi.fn(),
  selectWorkoutCollection: gateway.select,
  setWorkoutStartupFailure: vi.fn((failure: unknown) => { gateway.startupFailure = failure; }),
  startWorkoutSession: gateway.start,
  subscribeToWorkoutMutationBusy: vi.fn(() => () => undefined),
  subscribeToWorkoutPendingMutation: vi.fn(() => () => undefined),
  subscribeToWorkoutStartupFailure: vi.fn(() => () => undefined),
  subscribeToWorkoutSession: vi.fn(() => () => undefined),
  workoutEntry: {},
  workoutPendingMutationSnapshot: vi.fn(() => gateway.pending),
  workoutMutationBusySnapshot: vi.fn(() => false),
  workoutSnapshot: vi.fn(() => gateway.snapshot),
  workoutStartupFailureSnapshot: vi.fn(() => gateway.startupFailure),
}));

import ConnectGate from "./ConnectGate";

beforeEach(() => {
  gateway.snapshot = {
    phase: { kind: "choosing", lastApproval: null },
    collections: gateway.collections,
  };
  gateway.pending = null;
  gateway.connection = null;
  gateway.startupFailure = null;
  gateway.authorize.mockClear();
  gateway.select.mockClear();
  gateway.start.mockClear();
  gateway.applySetup.mockClear();
  gateway.recover.mockClear();
});

it("opens a listed collection through the session", async () => {
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  fireEvent.click(await screen.findByRole("button", { name: /Remembered workouts/ }));

  expect(gateway.select).toHaveBeenCalledWith("remembered-workouts", expect.anything());
});

it("chooses another collection through the SDK chooser", async () => {
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  fireEvent.click(screen.getByRole("button", { name: "Choose workout collection" }));

  expect(gateway.authorize).toHaveBeenCalledWith("choose", expect.anything());
});

it("asks for updated access before opening a rejected collection", () => {
  gateway.snapshot = {
    phase: {
      kind: "needs_approval",
      collectionId: "remembered-workouts",
      displayName: "Remembered workouts",
      declined: false,
    },
    collections: gateway.collections,
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  fireEvent.click(screen.getByRole("button", { name: "Review updated access" }));

  expect(gateway.authorize).toHaveBeenCalledWith("selected", expect.anything());
});

it("applies the reviewed setup plan", () => {
  gateway.snapshot = {
    phase: {
      kind: "needs_setup",
      collectionId: "remembered-workouts",
      collection: gateway.collections[0],
    },
    collections: gateway.collections,
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  fireEvent.click(screen.getByRole("button", { name: "Apply workout definitions" }));

  expect(gateway.applySetup).toHaveBeenCalled();
});

it("renders the connected application in the ready phase", () => {
  gateway.connection = {};
  gateway.snapshot = {
    phase: {
      kind: "ready",
      collectionId: "remembered-workouts",
      collection: gateway.collections[0],
      connection: { id: "remembered-workouts", displayName: "Remembered workouts", records: { ledger: { subscribe: () => () => undefined } } },
      rechecking: false,
      problem: null,
      unavailableTypes: [],
    },
    collections: gateway.collections,
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByText("Connected")).toBeTruthy();
});

it("offers recovery for an unsettled write", () => {
  gateway.pending = {
    collectionId: "remembered-workouts",
    requestId: "mutation-1",
    operation: "write",
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByText("mutation-1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Recover write" }));
  expect(gateway.recover).toHaveBeenCalled();
});

it("shows a signed-out session with a sign-in action", () => {
  gateway.snapshot = {
    phase: { kind: "signed_out", notice: null },
    collections: [],
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByRole("button", { name: "Sign in to mdbase" })).toBeEnabled();
});

it("shows a described problem with its action", () => {
  gateway.snapshot = {
    phase: {
      kind: "problem",
      collectionId: "remembered-workouts",
      problem: {
        key: "device_offline",
        title: "Your computer is offline",
        message: "Open mdbase connect on the computer holding this collection.",
        action: "wait",
        actionLabel: "Try again",
        retryAfterMs: null,
        updateUrl: null,
        severity: "warning",
        transient: true,
        code: "unavailable",
      },
    },
    collections: gateway.collections,
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByRole("alert")).toHaveTextContent("Open mdbase connect");
  expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
});
