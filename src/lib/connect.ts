import {
  MdbaseBrowserSelection,
  MdbaseConnect,
  type ConnectRequestOptions,
  type ConnectProblem,
  type MdbaseConnection,
  type MdbaseApplicationSessionSnapshot,
} from "@mdbase-dev/connect";
import { connectProblemFromError, requireConnectOutcome } from "./connect-outcome";

const environment = (import.meta as ImportMeta & {
  env: Record<string, string | boolean | undefined>;
}).env;
const isolatedStaging = environment.VITE_MDBASE_CONNECT_STAGING === "1";
const serverUrl = connectEnvironmentUrl(
  "VITE_MDBASE_CONNECT_URL",
  "https://connect.mdbase.dev",
);
const loopbackUrl = connectEnvironmentUrl(
  "VITE_MDBASE_CONNECT_LOOPBACK_URL",
  "http://127.0.0.1:28485",
);
if (isolatedStaging && new URL(serverUrl).origin === "https://connect.mdbase.dev") {
  throw new Error("An isolated Workouts build cannot use the production Connect endpoint.");
}
const appRoot = new URL(String(environment.BASE_URL || "./"), location.href);
const manifest = new URL(".well-known/mdbase-app.json", appRoot).href;

function connectEnvironmentUrl(name: string, fallback: string): string {
  const value = environment[name];
  if (typeof value === "string" && value.trim()) return value;
  if (isolatedStaging) {
    throw new Error(`${name} is required for an isolated Workouts build.`);
  }
  return fallback;
}

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
  collectionId: string;
  requestId: string;
  operation: string;
}

let pendingWorkoutMutation: PendingWorkoutMutation | null = null;
let activeWorkoutMutations = 0;
let startupFailure: unknown = null;
const pendingMutationListeners = new Set<() => void>();
const mutationListeners = new Set<() => void>();
const startupListeners = new Set<() => void>();

export function workoutPendingMutationSnapshot(): PendingWorkoutMutation | null {
  return pendingWorkoutMutation;
}

export function subscribeToWorkoutPendingMutation(listener: () => void): () => void {
  pendingMutationListeners.add(listener);
  return () => pendingMutationListeners.delete(listener);
}

export function refreshWorkoutPendingMutation(connection = workoutConnection()): void {
  publishPendingMutation(findPendingWorkoutMutation(connection));
}

export function rememberWorkoutPendingMutation(
  error: unknown,
  connection = workoutConnection(),
): boolean {
  const problem = connectProblemFromError(error);
  const requestId = (problem?.details as { request_id?: unknown } | undefined)?.request_id;
  if (problem?.operation_outcome !== "unknown" || typeof requestId !== "string") return false;
  const pending = connection?.pendingMutation(requestId)
    ?? connection?.pendingMutations().find((candidate) => candidate.requestId === requestId);
  publishPendingMutation({
    collectionId: connection?.collectionId ?? "unknown",
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
  const connection = workoutConnect.connection(summary.collectionId);
  if (!connection) {
    throw new Error("Reauthorize the collection before recovering this exact workout write.");
  }
  const pending = connection.pendingMutation(summary.requestId);
  if (!pending) {
    refreshWorkoutPendingMutation(connection);
    throw new Error("That pending workout write is no longer available.");
  }
  beginWorkoutMutation();
  try {
    requireConnectOutcome(await pending.recover({ timeoutMs: 20_000, ...options }));
    refreshWorkoutPendingMutation(connection);
  } catch (error) {
    rememberWorkoutPendingMutation(error, connection);
    throw error;
  } finally {
    endWorkoutMutation();
  }
}

export async function runWorkoutMutation<Value>(
  operation: (connection: MdbaseConnection) => Promise<Value>,
): Promise<Value> {
  const connection = requireWorkoutConnection();
  const pending = connection.pendingMutations()[0];
  if (pending) {
    publishPendingMutation({
      collectionId: connection.collectionId,
      requestId: pending.requestId,
      operation: pending.operation,
    });
    throw new Error("Recover the unsettled workout write before submitting another change.");
  }
  beginWorkoutMutation();
  try {
    return await operation(connection);
  } finally {
    endWorkoutMutation();
  }
}

export function workoutMutationBusySnapshot(): boolean {
  return activeWorkoutMutations > 0;
}

export function subscribeToWorkoutMutationBusy(listener: () => void): () => void {
  mutationListeners.add(listener);
  return () => mutationListeners.delete(listener);
}

export function workoutCollectionSwitchBlocker(targetCollectionId?: string): string | null {
  if (activeWorkoutMutations > 0) {
    return "Wait for the current workout change to finish before switching collections.";
  }
  const pending = findPendingWorkoutMutation(workoutConnection());
  publishPendingMutation(pending);
  if (pending && targetCollectionId !== pending.collectionId) {
    return `Open ${pending.collectionId} and recover request ${pending.requestId} before switching collections.`;
  }
  return null;
}

export function selectWorkoutCollection(collectionId: string): void {
  const blocker = workoutCollectionSwitchBlocker(collectionId);
  if (blocker) throw new Error(blocker);
  requireConnectOutcome(workoutSession.select(collectionId, { history: "replace" }));
}

export async function authorizeWorkoutCollection(
  target: "choose" | "selected",
  options: ConnectRequestOptions = {},
): Promise<void> {
  if (target === "choose") {
    const blocker = workoutCollectionSwitchBlocker();
    if (blocker) throw new Error(blocker);
  }
  requireConnectOutcome(await workoutSession.authorize(target, options));
}

export async function applyWorkoutCollectionSetup(
  options: ConnectRequestOptions = {},
): Promise<void> {
  await runWorkoutMutation(async (connection) => {
    try {
      requireConnectOutcome(await workoutSession.applyCollectionSetup(options));
    } catch (error) {
      rememberWorkoutPendingMutation(error, connection);
      throw error;
    }
  });
}

export function forgetWorkoutCollection(
  collectionId: string,
  options: { confirmPending?: boolean } = {},
): void {
  if (activeWorkoutMutations > 0) {
    throw new Error("Wait for the current workout change to finish before disconnecting.");
  }
  const pending = workoutConnect.connection(collectionId)?.pendingMutations() ?? [];
  const hasPending = pending.length > 0
    || pendingWorkoutMutation?.collectionId === collectionId;
  if (hasPending && !options.confirmPending) {
    throw new Error("This collection has unsettled writes. Recover them or explicitly confirm disconnecting and discarding recovery.");
  }
  requireConnectOutcome(workoutSession.forget(collectionId));
  if (pendingWorkoutMutation?.collectionId === collectionId) publishPendingMutation(null);
}

export function workoutStartupFailureSnapshot(): unknown {
  return startupFailure;
}

export function subscribeToWorkoutStartupFailure(listener: () => void): () => void {
  startupListeners.add(listener);
  return () => startupListeners.delete(listener);
}

export function setWorkoutStartupFailure(failure: unknown): void {
  if (startupFailure === failure) return;
  startupFailure = failure;
  for (const listener of startupListeners) listener();
}

export async function startWorkoutSession(options: ConnectRequestOptions = {}): Promise<void> {
  try {
    const outcome = await workoutSession.start(options);
    setWorkoutStartupFailure(outcome.ok ? null : connectProblemFailure(outcome.problem));
  } catch (error) {
    setWorkoutStartupFailure(error);
  }
}

export function connectProblemFailure(problem: ConnectProblem): unknown {
  return { problem };
}

function beginWorkoutMutation(): void {
  activeWorkoutMutations += 1;
  for (const listener of mutationListeners) listener();
}

function endWorkoutMutation(): void {
  activeWorkoutMutations = Math.max(0, activeWorkoutMutations - 1);
  for (const listener of mutationListeners) listener();
}

function findPendingWorkoutMutation(
  preferred: MdbaseConnection | null,
): PendingWorkoutMutation | null {
  const seen = new Set<string>();
  const connections = [
    preferred,
    ...workoutConnect.connections().map(({ collectionId }) =>
      workoutConnect.connection(collectionId)
    ),
  ];
  for (const connection of connections) {
    if (!connection || seen.has(connection.collectionId)) continue;
    seen.add(connection.collectionId);
    const pending = connection.pendingMutations()[0];
    if (pending) {
      return {
        collectionId: connection.collectionId,
        requestId: pending.requestId,
        operation: pending.operation,
      };
    }
  }
  return null;
}

function publishPendingMutation(next: PendingWorkoutMutation | null): void {
  if (pendingWorkoutMutation?.requestId === next?.requestId
      && pendingWorkoutMutation?.collectionId === next?.collectionId
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
