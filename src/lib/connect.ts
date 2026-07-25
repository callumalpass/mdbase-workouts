import {
  MdbaseBrowserLocation,
  MdbaseConnect,
  MdbaseConnectError,
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
const connectLocation = new MdbaseBrowserLocation(connect, {
  fallbackPath: appRoot.pathname,
});

export const workoutOperations: MdbaseOperation[] = [
  "describe",
  "read",
  "query",
  "create",
  "update",
  "delete",
];

export function savedConnections(): MdbaseConnectionInfo[] {
  return connect.connections();
}

export function activeConnection(): MdbaseConnection | null {
  return connectLocation.activeConnection();
}

export function connectionInfo(): MdbaseConnectionInfo | null {
  return activeConnection()?.info() ?? null;
}

export function selectConnection(collectionId: string, replace = false): void {
  connectLocation.selectConnection(collectionId, { replace });
}

export function authorizationReturnTo(): string {
  return connectLocation.authorizationReturnTo();
}

export function completeAuthorization(): Promise<MdbaseConnection> {
  return connectLocation.completeAuthorization();
}

export function connectIsRequired(): boolean {
  return environment.PROD === true || environment.VITE_MDBASE_CONNECT === "1";
}

export function clearAuthorizationCallback(): void {
  connectLocation.clearAuthorizationCallback();
}

export function isAuthorizationCallback(value: string): boolean {
  return connectLocation.isAuthorizationCallback(value);
}

export function selectedCollectionId(): string | null {
  return connectLocation.selectedCollectionId();
}

export function onConnectionChange(
  listener: (connection: MdbaseConnection | null) => void,
): () => void {
  return connectLocation.onChange(({ connection }) => listener(connection));
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
