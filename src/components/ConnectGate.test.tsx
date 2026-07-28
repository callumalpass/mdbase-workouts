import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const gateway = vi.hoisted(() => ({
  authorize: vi.fn(() => new Promise<never>(() => undefined)),
}));

vi.mock("../lib/connect", () => ({
  activeConnection: vi.fn(() => null),
  authorizationReturnTo: vi.fn(() => "/"),
  clearAuthorizationCallback: vi.fn(),
  completeAuthorization: vi.fn(),
  connect: {
    authorize: gateway.authorize,
    connection: vi.fn(() => null),
  },
  connectErrorMessage: vi.fn((reason: unknown) => String(reason)),
  connectIsRequired: vi.fn(() => true),
  connectionInfo: vi.fn(() => null),
  isAuthorizationCallback: vi.fn(() => false),
  onConnectionChange: vi.fn(() => () => undefined),
  savedConnections: vi.fn(() => [
    {
      collectionId: "stale-workouts",
      displayName: "Old workouts",
    },
  ]),
  selectConnection: vi.fn(),
  workoutOperations: ["describe", "read", "query"],
}));

import ConnectGate from "./ConnectGate";

it("connects another collection without pinning the stale selection", async () => {
  render(<ConnectGate><p>Connected</p></ConnectGate>);

  fireEvent.click(
    await screen.findByRole("button", { name: "Connect another collection" }),
  );

  expect(gateway.authorize).toHaveBeenCalledWith({
    operations: ["describe", "read", "query"],
    returnTo: "/",
  });
});
