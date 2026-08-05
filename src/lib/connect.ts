import {
  MdbaseBrowserSelection,
  MdbaseConnect,
  type ConnectRequestOptions,
  type MdbaseConnection,
  type MdbaseApplicationSessionSnapshot,
} from "@mdbase-dev/connect";
import { connectProblemFromError, requireConnectOutcome } from "./connect-outcome";

const environment = (import.meta as ImportMeta & {
  env: Record<string, string | boolean | undefined>;
}).env;
const serverUrl = String(environment.VITE_MDBASE_CONNECT_URL || "https://connect.mdbase.dev");
const loopbackUrl = String(environment.VITE_MDBASE_CONNECT_LOOPBACK_URL || "http://127.0.0.1:28485");
const appRoot = new URL(String(environment.BASE_URL || "./"), location.href);
const manifest = new URL(".well-known/mdbase-app.json", appRoot).href;

export const workoutConnect = new MdbaseConnect({
  serverUrl,
  loopbackUrl,
  manifest,
  redirectUri: appRoot.href,
});

export const workoutSession = workoutConnect.application({
  selection: new MdbaseBrowserSelection({
    fallbackPath: appRoot.pathname,
  }),
});

export interface PendingWorkoutMutation {
  requestId: string;
  operation: string;
}

let pendingWorkoutMutation: PendingWorkoutMutation | null = null;
const pendingMutationListeners = new Set<() => void>();

export function workoutPendingMutationSnapshot(): PendingWorkoutMutation | null {
  return pendingWorkoutMutation;
}

export function subscribeToWorkoutPendingMutation(listener: () => void): () => void {
  pendingMutationListeners.add(listener);
  return () => pendingMutationListeners.delete(listener);
}

export function refreshWorkoutPendingMutation(): void {
  const pending = workoutConnection()?.pendingMutations()[0];
  publishPendingMutation(pending ? {
    requestId: pending.requestId,
    operation: pending.operation,
  } : null);
}

export function rememberWorkoutPendingMutation(error: unknown): boolean {
  const problem = connectProblemFromError(error);
  const requestId = (problem?.details as { request_id?: unknown } | undefined)?.request_id;
  if (problem?.operation_outcome !== "unknown" || typeof requestId !== "string") return false;
  const connection = workoutConnection();
  const pending = connection?.pendingMutation(requestId)
    ?? connection?.pendingMutations().find((candidate) => candidate.requestId === requestId);
  publishPendingMutation({
    requestId,
    operation: pending?.operation ?? "write",
  });
  return true;
}

export async function recoverWorkoutPendingMutation(
  options: ConnectRequestOptions = {},
): Promise<void> {
  const summary = pendingWorkoutMutation;
  if (!summary) return;
  const pending = requireWorkoutConnection().pendingMutation(summary.requestId);
  if (!pending) {
    refreshWorkoutPendingMutation();
    throw new Error("That pending workout write is no longer available.");
  }
  try {
    requireConnectOutcome(await pending.recover({ timeoutMs: 20_000, ...options }));
    refreshWorkoutPendingMutation();
  } catch (error) {
    rememberWorkoutPendingMutation(error);
    throw error;
  }
}

function publishPendingMutation(next: PendingWorkoutMutation | null): void {
  if (pendingWorkoutMutation?.requestId === next?.requestId
      && pendingWorkoutMutation?.operation === next?.operation) return;
  pendingWorkoutMutation = next;
  for (const listener of pendingMutationListeners) listener();
}

export function workoutSnapshot(): MdbaseApplicationSessionSnapshot {
  return workoutSession.getSnapshot();
}

export function subscribeToWorkoutSession(listener: () => void): () => void {
  return workoutSession.subscribe(listener);
}

export function workoutConnection(): MdbaseConnection | null {
  return workoutSession.connection();
}

export function requireWorkoutConnection(): MdbaseConnection {
  const connection = workoutConnection();
  if (!connection) {
    throw new Error("Choose a workout collection before loading records.");
  }
  return connection;
}

export function connectIsRequired(): boolean {
  return environment.PROD === true || environment.VITE_MDBASE_CONNECT === "1";
}

export function connectErrorMessage(error: unknown): string {
  const problem = connectProblemFromError(error);
  if (problem) {
    const code = problem.code;
    if (code === "connector_offline") return "The computer holding this collection is offline.";
    if (problem.recovery === "upgrade_connector") {
      return "Update mdbase connect on the collection computer before continuing.";
    }
    if (code === "not_authorized" || code === "authorization_expired") {
      return "This connection has expired. Choose the collection again.";
    }
    if (code === "insufficient_access") return "This connection does not include the access Workouts needs.";
    if (code === "unknown_collection") return "That collection is no longer authorized on this device.";
  }
  if (error instanceof Error) return error.message;
  return "The workout collection could not be reached.";
}
