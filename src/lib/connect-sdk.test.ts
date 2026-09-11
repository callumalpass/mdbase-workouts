/// <reference types="node" />
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MdbaseConnect, MdbaseMemorySelection } from "@mdbase-dev/connect";
import { MemoryApplicationIdentityStore, MemoryGrantKeyStore } from "@mdbase-dev/connect/crypto";
import { installMdbaseBrowserFixture, requireConnectSuccess, type MdbaseTestPage } from "@mdbase-dev/connect-testing";
import { APPLICATION_AUTHORIZATION_V2_ISSUANCE_CAPABILITY, APPLICATION_SETUP_OPERATIONS, operationsForApplicationCapabilities, type MdbaseAppManifest } from "@mdbase-dev/connect-protocol";
import manifestJson from "../../public/.well-known/mdbase-app.json";

const manifest = manifestJson as MdbaseAppManifest;
const serverUrl = "https://connect.workouts.invalid";
const operations = operationsForApplicationCapabilities(manifest.requirements!.capabilities!);
// The fixture adapter executes in jsdom only: no browser, daemon, or network.
const page: MdbaseTestPage = { evaluate: async (script, argument) => script(argument) };
const sessions: ReturnType<MdbaseConnect["application"]>[] = [];
let requests: { url: string; body: string }[];
let deny = false;
let supportsFreshV2 = true;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  requests = [];
  deny = false;
  supportsFreshV2 = true;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, body: String(init?.body ?? "") });
    if (url === `${serverUrl}/health`) return Response.json({ capabilities: supportsFreshV2 ? [APPLICATION_AUTHORIZATION_V2_ISSUANCE_CAPABILITY] : [] });
    if (url === `${serverUrl}/v1/apps/register`) return Response.json({ application: {
      id: "11111111-1111-4111-8111-111111111111", family_identity: `bundle:${manifest.id}`, manifest_digest: "0".repeat(64),
      name: manifest.name, distribution: "web", requirements: manifest.requirements,
      provisions: manifest.provisions,
    } });
    if (url === `${serverUrl}/oauth/authorization_request`) {
      if (deny) return Response.json({ error: "access_denied", message: "Approval denied." }, { status: 403 });
      const form = new URLSearchParams(String(init?.body));
      const proof = JSON.parse(form.get("application_authorization")!);
      return Response.json({ authorization_uri: `${serverUrl}/approve`, authorization_id: proof.binding.authorization_id, expires_in: 60 });
    }
    throw new Error(`Unexpected network request: ${url}`);
  }));
});
afterEach(() => {
  for (const session of sessions.splice(0)) session.destroy();
  vi.unstubAllGlobals();
  localStorage.clear();
});
function runtime() {
  const navigate = vi.fn();
  const connect = new MdbaseConnect({ serverUrl, manifest, storage: localStorage,
    redirectUri: "https://workouts.invalid/", navigate,
    keyStore: new MemoryGrantKeyStore(), identityStore: new MemoryApplicationIdentityStore(),
    directAccess: "disabled",
  });
  const selection = new MdbaseMemorySelection();
  const session = connect.application({ selection });
  sessions.push(session);
  return { connect, session, selection, navigate };
}

describe("packed beta.96 Workouts SDK contract (hermetic)", () => {
  it("derives exact record intent plus provision-bound setup in the signed authorization request", async () => {
    const { session, navigate } = runtime();
    expect(requireConnectSuccess(await session.start()).status).toBe("unselected");
    expect(requests).toHaveLength(1); // Starting never opens approval.
    expect(requireConnectSuccess(await session.authorize("choose"))).toEqual({ kind: "redirecting" });
    const registration = JSON.parse(requests[0].body);
    expect(registration.manifest).toEqual(manifest);
    const form = new URLSearchParams(requests.find(({ url }) => url.endsWith("/oauth/authorization_request"))!.body);
    const expected = [...new Set([...operations, ...APPLICATION_SETUP_OPERATIONS])];
    expect(form.get("operations")!.split(",")).toEqual(expected);
    const proof = JSON.parse(form.get("application_authorization")!);
    expect(proof.binding.requested_operations).toEqual(expected);
    expect(proof.binding.contracts.semantic_capabilities).toBe(2);
    expect(proof.binding.requested_files).toBeUndefined();
    expect(proof.signature).toEqual(expect.any(String));
    expect(expected).not.toContain("apply_type_pack");
    expect(navigate).toHaveBeenCalledWith(`${serverUrl}/approve`);
  });

  it("returns denial without retry, fallback, navigation, or automatic approval", async () => {
    deny = true;
    const { session, navigate } = runtime();
    requireConnectSuccess(await session.start());
    expect(await session.authorize("choose")).toMatchObject({ ok: false, problem: { code: "access_denied" } });
    expect(session.getSnapshot().status).toBe("unselected");
    expect(requests).toHaveLength(3);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("blocks fresh v2 authorization on a v1-only server without fallback or navigation", async () => {
    supportsFreshV2 = false;
    const { session, navigate, connect } = runtime();
    requireConnectSuccess(await session.start());
    const before = connect.connections();
    expect(await session.authorize("choose")).toMatchObject({ ok: false, problem: { code: "capability_contract_incompatible" } });
    expect(requests.map(({ url }) => url)).toEqual([`${serverUrl}/v1/apps/register`, `${serverUrl}/health`]);
    expect(navigate).not.toHaveBeenCalled();
    expect(connect.connections()).toEqual(before);
    expect(session.getSnapshot().status).toBe("unselected");
  });

  it("rejects legacy operation overrides before sending authorization", async () => {
    const { connect, session } = runtime();
    requireConnectSuccess(await session.start());
    expect(await connect.authorize({ operations: ["read"] })).toMatchObject({ ok: false, problem: { code: "invalid_application_manifest" } });
    expect(requests).toHaveLength(1);
  });

  it("rejects an unbound legacy fixture grant without broadening or applying setup", async () => {
    await installMdbaseBrowserFixture(page, {
      serverUrl, application: { manifest },
      collection: { id: "reduced", name: "Reduced", operations: ["describe", "read", "query", "changes"] },
      authority: { kind: "hosted", operationsUrl: "https://authority.invalid/operations", syncUrl: "https://authority.invalid/sync", filesUrl: "https://authority.invalid/files", replicaId: "fixture" },
    });
    const { connect, session, selection } = runtime();
    selection.select("reduced");
    requireConnectSuccess(await session.start());
    expect(session.getSnapshot()).toMatchObject({ status: "unavailable", reason: "invalid_stored_grant" });
    expect(connect.connection("reduced")).toBeNull();
    expect(await session.applyCollectionSetup()).toMatchObject({ ok: false, problem: { code: "collection_not_ready" } });
    expect(requests).toHaveLength(1);
    requireConnectSuccess(await session.authorize("choose"));
    expect(requests).toHaveLength(3);
  });
});
