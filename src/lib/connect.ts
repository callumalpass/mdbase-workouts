import {
  MdbaseBrowserSelection,
  MdbaseConnect,
  MdbaseConnectError,
  type MdbaseConnection,
  type MdbaseOperation,
  type MdbaseSessionSnapshot,
} from "@mdbase/connect";

const environment = (import.meta as ImportMeta & {
  env: Record<string, string | boolean | undefined>;
}).env;
const serverUrl = String(environment.VITE_MDBASE_CONNECT_URL || "https://connect.mdbase.dev");
const appRoot = new URL(String(environment.BASE_URL || "./"), location.href);
const manifest = new URL(".well-known/mdbase-app.json", appRoot).href;

export const workoutOperations: MdbaseOperation[] = [
  "describe",
  "read",
  "query",
  "create",
  "update",
  "delete",
];

export const workoutConnect = new MdbaseConnect({
  serverUrl,
  manifest,
  redirectUri: appRoot.href,
});

export const workoutSession = workoutConnect.createSession({
  operations: workoutOperations,
  selection: new MdbaseBrowserSelection({
    fallbackPath: appRoot.pathname,
  }),
});

export function workoutSnapshot(): MdbaseSessionSnapshot {
  return workoutSession.getSnapshot();
}

export function subscribeToWorkoutSession(listener: () => void): () => void {
  return workoutSession.subscribe(listener);
}

export function workoutConnection(): MdbaseConnection | null {
  const snapshot = workoutSnapshot();
  return snapshot.status === "ready" ? snapshot.connection : null;
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
  if (error instanceof MdbaseConnectError) {
    if (error.code === "connector_offline") return "The computer holding this collection is offline.";
    if (error.code === "not_authorized" || error.code === "authorization_expired") {
      return "This connection has expired. Choose the collection again.";
    }
    if (error.code === "insufficient_access") return "This connection does not include the access Workouts needs.";
    if (error.code === "unknown_collection") return "That collection is no longer authorized on this device.";
  }
  if (error instanceof Error) return error.message;
  return "The workout collection could not be reached.";
}
