import {
  MdbaseConnect,
  MdbaseConnectError,
  type MdbaseAuthorizationResult,
  type MdbaseConnection,
  type MdbaseConnectionInfo,
  type MdbaseOperation,
} from "@mdbase/connect";

const environment = (import.meta as ImportMeta & {
  env: Record<string, string | boolean | undefined>;
}).env;
const serverUrl = String(environment.VITE_MDBASE_CONNECT_URL || "https://connect.mdbase.dev");
const appRoot = new URL(String(environment.BASE_URL || "./"), location.href);
const manifest = new URL(".well-known/mdbase-app.json", appRoot).href;

export const connect = new MdbaseConnect({
  serverUrl,
  manifest,
  redirectUri: appRoot.href,
});

export const workoutOperations: MdbaseOperation[] = [
  "describe",
  "read",
  "query",
  "create",
  "update",
  "delete",
];

const COLLECTION_PARAMETER = "collection";

export function savedConnections(): MdbaseConnectionInfo[] {
  return connect.connections();
}

export function activeConnection(): MdbaseConnection | null {
  const selected = new URL(location.href).searchParams.get(COLLECTION_PARAMETER);
  if (selected) return connect.connection(selected);
  const saved = connect.connections();
  if (saved.length !== 1) return null;
  selectConnection(saved[0].collectionId, true);
  return connect.connection(saved[0].collectionId);
}

export function connectionInfo(): MdbaseConnectionInfo | null {
  return activeConnection()?.info() ?? null;
}

export function selectConnection(collectionId: string, replace = false): void {
  const url = new URL(location.href);
  url.searchParams.set(COLLECTION_PARAMETER, collectionId);
  for (const parameter of ["code", "state", "error", "error_description"]) {
    url.searchParams.delete(parameter);
  }
  history[replace ? "replaceState" : "pushState"]({}, "", url);
}

export function authorizationReturnTo(): string {
  const url = new URL(location.href);
  for (const parameter of ["code", "state", "error", "error_description"]) {
    url.searchParams.delete(parameter);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function finishAuthorization(
  result: MdbaseAuthorizationResult,
): MdbaseConnection {
  const returnTo = new URL(result.returnTo ?? appRoot.href, location.origin);
  returnTo.searchParams.set(COLLECTION_PARAMETER, result.connection.collectionId);
  for (const parameter of ["code", "state", "error", "error_description"]) {
    returnTo.searchParams.delete(parameter);
  }
  history.replaceState({}, "", returnTo);
  return result.connection;
}

export function connectIsRequired(): boolean {
  return environment.PROD === true || environment.VITE_MDBASE_CONNECT === "1";
}

export function clearAuthorizationCallback(): void {
  const url = new URL(location.href);
  for (const parameter of ["code", "state", "error", "error_description"]) {
    url.searchParams.delete(parameter);
  }
  history.replaceState({}, "", url);
}

export function connectErrorMessage(error: unknown): string {
  if (error instanceof MdbaseConnectError) {
    if (error.code === "connector_offline") return "The computer holding this collection is offline.";
    if (error.code === "not_authorized" || error.code === "authorization_expired") {
      return "This connection has expired. Choose the collection again.";
    }
    if (error.code === "insufficient_access") return "This connection does not include the access Workouts needs.";
  }
  if (error instanceof Error) return error.message;
  return "The workout collection could not be reached.";
}
