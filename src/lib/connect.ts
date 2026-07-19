import { MdbaseConnect, type MdbaseOperation } from "@mdbase/connect";

const environment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const serverUrl = environment?.VITE_MDBASE_CONNECT_URL || "http://localhost:18789";
const manifestUrl = new URL("/.well-known/mdbase-app.json", location.origin).href;
const redirectUri = new URL("/connect/callback", location.origin).href;

export const connect = new MdbaseConnect({
  serverUrl,
  manifestUrl,
  redirectUri,
  storage: localStorage,
});

export const workoutOperations: MdbaseOperation[] = [
  "read",
  "query",
  "create",
  "update",
  "delete",
];

export function connectionInfo() {
  return connect.connection();
}

export function connectServerUrl(): string {
  return serverUrl;
}
