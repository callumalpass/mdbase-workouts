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
    follow: vi.fn(() => () => undefined),
    select: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    unlock: vi.fn(async () => undefined),
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
  selectWorkoutCollection: gateway.select,
  startWorkoutSession: gateway.start,
  subscribeToWorkoutStartupFailure: vi.fn(() => () => undefined),
  subscribeToWorkoutSession: vi.fn(() => () => undefined),
  unlockWorkoutCollection: gateway.unlock,
  workoutSnapshot: vi.fn(() => gateway.snapshot),
  workoutStartupFailureSnapshot: vi.fn(() => gateway.startupFailure),
}));

vi.mock("../lib/connect-api", () => ({
  followWorkoutCollection: gateway.follow,
  resetWorkoutCollectionCache: vi.fn(),
}));

import ConnectGate from "./ConnectGate";

beforeEach(() => {
  gateway.snapshot = {
    phase: { kind: "choosing", lastApproval: null },
    collections: gateway.collections,
  };
  gateway.connection = null;
  gateway.startupFailure = null;
  gateway.authorize.mockClear();
  gateway.select.mockClear();
  gateway.start.mockClear();
  gateway.applySetup.mockClear();
  gateway.follow.mockClear();
  gateway.unlock.mockClear();
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
  // The person answers in the Connect window; a timeout would close it mid-pick.
  expect(gateway.authorize.mock.calls[0][1]).not.toHaveProperty("timeoutMs");
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
  expect(gateway.authorize.mock.calls[0][1]).not.toHaveProperty("timeoutMs");
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

it("says what a slow Private collection is waiting for", () => {
  gateway.snapshot = {
    phase: {
      kind: "opening",
      collectionId: "remembered-workouts",
      displayName: "Remembered workouts",
      slow: true,
      progress: "connecting_log",
    },
    collections: gateway.collections,
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByRole("status")).toHaveTextContent("Opening Remembered workouts · connecting…");
  expect(screen.getByRole("status")).toHaveTextContent("allow Workouts if it asks");
});

it("points to the Connect window while it is open", () => {
  gateway.snapshot = {
    phase: { kind: "authorizing", purpose: "add", collectionId: null },
    collections: gateway.collections,
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByRole("status")).toHaveTextContent("Continue in the mdbase window.");
});

it("unlocks a Private collection with the encryption password", () => {
  gateway.snapshot = {
    phase: {
      kind: "needs_unlock",
      collectionId: "remembered-workouts",
      displayName: "Remembered workouts",
      mode: "password",
      unlocking: false,
      problem: null,
    },
    collections: gateway.collections,
  };
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  const field = screen.getByLabelText(/Encryption password/) as HTMLInputElement;
  fireEvent.change(field, { target: { value: "correct horse" } });
  fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

  expect(gateway.unlock).toHaveBeenCalledWith("remembered-workouts", "correct horse", expect.anything());
  expect(field.value).toBe("");
});

function readySnapshot(sync: Record<string, unknown> | null, acknowledge = vi.fn(async () => undefined)) {
  return {
    phase: {
      kind: "ready",
      collectionId: "remembered-workouts",
      collection: gateway.collections[0],
      connection: {
        id: "remembered-workouts",
        displayName: "Remembered workouts",
        records: { ledger: { acknowledge } },
      },
      rechecking: false,
      problem: null,
      unavailableTypes: [],
    },
    collections: gateway.collections,
    sync,
  };
}

function sync(overrides: Record<string, unknown>) {
  return {
    state: "saved",
    connection: "online",
    health: null,
    live: true,
    pending: 0,
    pendingFor: null,
    writes: { pending: [], rejected: [], saveState: "saved", restored: true },
    attention: [],
    conflicts: 0,
    holds: 0,
    incidents: [],
    ...overrides,
  };
}

it("renders the connected application in the ready phase and follows the collection", () => {
  gateway.snapshot = readySnapshot(sync({}));
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByText("Connected")).toBeTruthy();
  expect(gateway.follow).toHaveBeenCalledWith(expect.objectContaining({ collectionId: "remembered-workouts" }));
  expect(screen.queryByRole("status")).toBeNull();
});

it("says when changes are kept on this device", () => {
  gateway.snapshot = readySnapshot(sync({ state: "saved_on_device", connection: "offline", pending: 2, pendingFor: "while" }));
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByRole("status")).toHaveTextContent("Saved on this device");
});

it("shows a refused write until it is dismissed", () => {
  const acknowledge = vi.fn(async () => undefined);
  gateway.snapshot = readySnapshot(sync({
    state: "attention",
    attention: ["rejected"],
    writes: {
      pending: [],
      rejected: [{ mutationId: "mutation-1", records: [], createdAt: 0, state: "rejected" }],
      saveState: "rejected",
      restored: true,
    },
  }), acknowledge);
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  expect(screen.getByRole("alert")).toHaveTextContent("A change was not saved.");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(acknowledge).toHaveBeenCalledWith("mutation-1");
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
