import {
  createMdbase,
  describeError,
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

/**
 * Where Connect returns the Private-collection approval window: the manifest's
 * redirect URI on this origin, else the origin root (the SDK chooses the same).
 */
export const workoutRedirectUri = manifest.redirect_uris.find((uri) => {
  try { return new URL(uri).origin === appRoot.origin; } catch { return false; }
}) ?? new URL("/", appRoot.origin).href;

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

export interface ConnectRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

let startupFailure: unknown = null;
const startupListeners = new Set<() => void>();

// Session work (start, sign-in, choosing, opening, setup) is not timed here.
// The SDK bounds its own network waits, and sign-in waits on the person in the
// Connect window; aborting either closes that window or stops the SDK. A
// signal only cancels work the person walked away from.
export async function selectWorkoutCollection(
  collectionId: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  await entry().select(collectionId, options);
}

/** From the sign-in button: sign in to mdbase (opens Connect). */
export async function signInToWorkouts(options: { signal?: AbortSignal } = {}): Promise<void> {
  await entry().signIn(options);
}

/** From the add button once signed in: choose or create a collection in Connect. */
export async function addWorkoutCollection(options: { signal?: AbortSignal } = {}): Promise<void> {
  await entry().addCollection(options);
}

/** From the allow button: approve one collection (default: the requested one). */
export async function approveWorkoutCollection(
  collectionId: string | null,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  await entry().approve(collectionId, options);
}

export async function applyWorkoutCollectionSetup(
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  // A plan that no longer matches the collection is refused with "changed" and
  // nothing written; plan once more against what is there now.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const plan = await entry().setup.plan(options);
    const result = await entry().setup.apply(plan, options);
    if (result.outcome !== "changed") return;
  }
  throw new Error("The workout collection kept changing while its definitions were being applied. Try again.");
}

/** Unlock a Private collection with the account's encryption password. The
 * password goes straight to the SDK, which neither stores nor logs it. */
export async function unlockWorkoutCollection(
  collectionId: string,
  password: string,
  options: ConnectRequestOptions = {},
): Promise<void> {
  await entry().unlock(collectionId, { password }, options);
}

/**
 * Sign out of mdbase in this browser and erase its sign-in data, so the next
 * sign-in starts a fresh installation. This is the way out of a sign-in this
 * browser can no longer finish (for example device keys that were only half
 * created). `confirmDiscard` is asked before changes that have not reached
 * mdbase are thrown away; answering no keeps everything as it is.
 */
export async function startWorkoutsOver(
  confirmDiscard: (pending: number | null) => boolean,
): Promise<boolean> {
  try {
    await entry().signOut();
    return true;
  } catch (error) {
    if (!isPendingWrites(error)) throw error;
    if (!confirmDiscard(pendingCount(error))) return false;
    await entry().signOut({ discard: true });
    return true;
  }
}

function isPendingWrites(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { reason, code } = error as { reason?: unknown; code?: unknown };
  return reason === "sign_out_pending_writes" || code === "sign_out_pending_writes";
}

function pendingCount(error: unknown): number | null {
  const details = (error as { details?: unknown }).details;
  return typeof details === "number" && details > 0 ? details : null;
}

export async function forgetWorkoutCollection(collectionId: string): Promise<void> {
  await entry().forget(collectionId);
}

export function workoutStartupFailureSnapshot(): unknown {
  return startupFailure;
}

export function subscribeToWorkoutStartupFailure(listener: () => void): () => void {
  startupListeners.add(listener);
  return () => startupListeners.delete(listener);
}

function setWorkoutStartupFailure(failure: unknown): void {
  if (startupFailure === failure) return;
  startupFailure = failure;
  for (const listener of startupListeners) listener();
}

export async function startWorkoutSession(options: { signal?: AbortSignal } = {}): Promise<void> {
  try {
    await entry().start(options);
    setWorkoutStartupFailure(null);
  } catch (error) {
    setWorkoutStartupFailure(error);
  }
}

export function workoutSnapshot(): MdbaseSnapshot {
  return entry().getSnapshot();
}

function workoutPhase(): MdbasePhase {
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
