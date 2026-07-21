import {
  MdbaseConnect,
  MdbaseConnectError,
  type MdbaseOperation,
} from "@mdbase/connect";

const environment = (import.meta as ImportMeta & {
  env: Record<string, string | boolean | undefined>;
}).env;
const serverUrl = String(environment.VITE_MDBASE_CONNECT_URL || "https://connect.mdbase.dev");
const appRoot = new URL(String(environment.BASE_URL || "./"), location.href);
const manifestUrl = new URL(".well-known/mdbase-app.json", appRoot).href;

export const connect = new MdbaseConnect({
  serverUrl,
  manifestUrl,
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

export function connectionInfo() {
  return connect.connection();
}

export function connectIsRequired(): boolean {
  return environment.PROD === true || environment.VITE_MDBASE_CONNECT === "1";
}

export function clearAuthorizationCallback(): void {
  history.replaceState({}, "", appRoot.href);
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
