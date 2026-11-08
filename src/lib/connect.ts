import {
  createMdbase,
  describeError,
  isMdbaseError,
  type Mdbase,
  type MdbaseApplicationDeclaration,
  type MdbaseClient,
  type MdbasePhase,
  type MdbaseSnapshot,
} from "@mdbase-dev/sdk";
import manifest from "../generated/mdbase-app.json";

const environment = (import.meta as ImportMeta & {
  env: Record<string, string | boolean | undefined>;
}).env;
const isolatedStaging = environment.VITE_MDBASE_CONNECT_STAGING === "1";
const connectUrl = environment.VITE_MDBASE_CONNECT_URL;
const expectedConnectOrigin = isolatedStaging
  ? "https://connect-staging.mdbase.dev"
  : "https://connect.mdbase.dev";
if (typeof connectUrl === "string" && connectUrl.trim()
    && new URL(connectUrl).origin !== expectedConnectOrigin) {
  throw new Error(`Workouts requires the ${isolatedStaging ? "isolated staging" : "production"} mdbase Connect endpoint.`);
}

const appRoot = new URL(String(environment.BASE_URL || "./"), location.href);
export const workoutDeclaration: MdbaseApplicationDeclaration = {
  id: manifest.id,
  name: manifest.name,
  origin: appRoot.origin,
  // The published SDK carries production trust. Non-HTTPS origins are local
  // development; they still need a locally built SDK to open a collection.
  environment: isolatedStaging
    ? "staging"
    : appRoot.protocol === "https:"
      ? "production"
      : "lab",
  manifest,
  storage: { applicationNamespace: "mdbase-workouts" },
};

let workoutEntry: Mdbase | null = null;

function entry(): Mdbase {
  workoutEntry ??= createMdbase(workoutDeclaration, {
    privateCollections: true,
    followVisibility: true,
  });
  return workoutEntry;
}

/** Test-only seam: replace the entry with an SDK fixture. */
export function setWorkoutEntryForTests(next: Mdbase | null): void {
  workoutEntry = next;
}

export interface WorkoutConnection {
  readonly collectionId: string;
  readonly displayName: string;
  readonly records: MdbaseClient;
}

export interface PendingWorkoutMutation {
  collectionId: string;
  requestId: string;
  operation: string;
}

export interface ConnectRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
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
  const code = problemCode(error);
  if (code !== "outcome_unknown" && code !== "unavailable") return false;
  const pending = findPendingWorkoutMutation(connection);
  if (!pending) return false;
  publishPendingMutation(pending);
  return true;
}

export async function recoverWorkoutPendingMutation(
  options: ConnectRequestOptions = {},
): Promise<void> {
  const summary = pendingWorkoutMutation;
  if (!summary) return;
  const connection = workoutConnection();
  if (!connection || connection.collectionId !== summary.collectionId) {
    throw new Error("Reauthorize the collection before recovering this exact workout write.");
  }
  beginWorkoutMutation();
  try {
    await connection.records.receipt(summary.requestId, requestSignal(options).signal);
    refreshWorkoutPendingMutation(connection);
  } catch (error) {
    rememberWorkoutPendingMutation(error, connection);
    throw error;
  } finally {
    endWorkoutMutation();
  }
}

export async function runWorkoutMutation<Value>(
  operation: (connection: WorkoutConnection) => Promise<Value>,
): Promise<Value> {
  const connection = requireWorkoutConnection();
  const pending = findPendingWorkoutMutation(connection);
  if (pending) {
    publishPendingMutation(pending);
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
    return `Open ${pending.collectionId} and recover write ${pending.requestId} before switching collections.`;
  }
  return null;
}

export async function selectWorkoutCollection(
  collectionId: string,
  options: ConnectRequestOptions = {},
): Promise<void> {
  const blocker = workoutCollectionSwitchBlocker(collectionId);
  if (blocker) throw new Error(blocker);
  await entry().select(collectionId, requestSignal(options));
}

export async function authorizeWorkoutCollection(
  target: "choose" | "selected",
  options: ConnectRequestOptions = {},
): Promise<void> {
  if (target === "choose") {
    const blocker = workoutCollectionSwitchBlocker();
    if (blocker) throw new Error(blocker);
    await entry().addCollection(requestSignal(options));
    return;
  }
  await entry().reauthorize(requestSignal(options));
}

export async function applyWorkoutCollectionSetup(
  options: ConnectRequestOptions = {},
): Promise<void> {
  await runWorkoutMutation(async () => {
    const request = requestSignal(options);
    const plan = await entry().setup.plan(request);
    await entry().setup.apply(plan, request);
  });
}

export async function forgetWorkoutCollection(
  collectionId: string,
  options: { confirmPending?: boolean } = {},
): Promise<void> {
  if (activeWorkoutMutations > 0) {
    throw new Error("Wait for the current workout change to finish before disconnecting.");
  }
  const pending = findPendingWorkoutMutation(workoutConnection());
  const hasPending = pending?.collectionId === collectionId
    || pendingWorkoutMutation?.collectionId === collectionId;
  if (hasPending && !options.confirmPending) {
    throw new Error("This collection has unsettled writes. Recover them or explicitly confirm disconnecting and discarding recovery.");
  }
  await entry().forget(collectionId);
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
    await entry().start(requestSignal(options));
    setWorkoutStartupFailure(null);
  } catch (error) {
    setWorkoutStartupFailure(error);
  }
}

export function connectProblemFailure(problem: unknown): unknown {
  return problem;
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
  connection: WorkoutConnection | null,
): PendingWorkoutMutation | null {
  if (!connection) return null;
  const snapshot = connection.records.ledger.getSnapshot();
  const pending = snapshot.pending[0];
  if (!pending) return null;
  return {
    collectionId: connection.collectionId,
    requestId: pending.mutationId,
    operation: "write",
  };
}

function publishPendingMutation(next: PendingWorkoutMutation | null): void {
  if (pendingWorkoutMutation?.requestId === next?.requestId
      && pendingWorkoutMutation?.collectionId === next?.collectionId
      && pendingWorkoutMutation?.operation === next?.operation) return;
  pendingWorkoutMutation = next;
  for (const listener of pendingMutationListeners) listener();
}

export function workoutSnapshot(): MdbaseSnapshot {
  return entry().getSnapshot();
}

export function workoutPhase(): MdbasePhase {
  return entry().getSnapshot().phase;
}

export function subscribeToWorkoutSession(listener: () => void): () => void {
  return entry().subscribe(listener);
}

export function workoutConnection(): WorkoutConnection | null {
  const phase = workoutPhase();
  if (phase.kind !== "ready") return null;
  return connectionFrom(phase);
}

export function workoutCollections(): MdbaseSnapshot["collections"] {
  return entry().getSnapshot().collections;
}

export function requireWorkoutConnection(): WorkoutConnection {
  const connection = workoutConnection();
  if (!connection) {
    throw new Error("Choose a workout collection before loading records.");
  }
  return connection;
}

function connectionFrom(
  phase: Extract<MdbasePhase, { kind: "ready" }>,
): WorkoutConnection {
  return {
    collectionId: phase.connection.id,
    displayName: phase.connection.displayName,
    records: phase.connection.records,
  };
}

export function connectIsRequired(): boolean {
  return environment.PROD === true || environment.VITE_MDBASE_CONNECT === "1";
}

export function connectErrorMessage(error: unknown): string {
  const described = describeError(error);
  if (described) return described.message;
  if (error && typeof error === "object" && "problem" in error) {
    const problem = (error as { problem?: { message?: unknown } }).problem;
    if (problem && typeof problem.message === "string") return problem.message;
  }
  if (error instanceof Error) return error.message;
  return "The workout collection could not be reached.";
}

function problemCode(error: unknown): string | null {
  if (isMdbaseError(error)) return error.code;
  if (error && typeof error === "object" && "code" in error
      && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

function requestSignal(options: ConnectRequestOptions): { signal?: AbortSignal } {
  const timeout = options.timeoutMs;
  const timeoutSignal = timeout === undefined ? undefined : AbortSignal.timeout(timeout);
  const signal = options.signal && timeoutSignal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : options.signal ?? timeoutSignal;
  return signal ? { signal } : {};
}
