import { describe, expect, it, vi } from "vitest";
import source from "../../public/sw-wasm.js?raw";

/** Loads public/sw-wasm.js against a fake service worker scope. */
function loadHandler(upstream: Response) {
  let listener: ((event: unknown) => void) | null = null;
  const scope = {
    location: { origin: "https://workouts.mdbase.dev" },
    addEventListener: (_type: string, handler: (event: unknown) => void) => { listener = handler; },
  };
  const fetcher = vi.fn(async () => upstream);
  new Function("self", "fetch", source)(scope, fetcher);
  return async (url: string) => {
    const answer: { value: Promise<Response> | null } = { value: null };
    listener!({ request: new Request(url), respondWith: (value: Promise<Response>) => { answer.value = value; } });
    return { answered: answer.value, fetcher };
  };
}

const gzipped = (body: Uint8Array<ArrayBuffer>) => new Response(body, {
  headers: { "content-type": "application/wasm", "content-encoding": "gzip", "content-length": "3" },
});

describe("the service worker's .wasm handler", () => {
  it("drops the compressed size so the SDK sees the decoded bytes", async () => {
    const handle = loadHandler(gzipped(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])));
    const { answered } = await handle("https://workouts.mdbase.dev/assets/runtime-x.wasm");
    const response = await answered!;

    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-type")).toBe("application/wasm");
    expect(new Uint8Array(await response.arrayBuffer())).toHaveLength(8);
  });

  it("leaves other requests to Workbox", async () => {
    const handle = loadHandler(gzipped(new Uint8Array([1])));
    expect((await handle("https://workouts.mdbase.dev/assets/index.js")).answered).toBeNull();
    expect((await handle("https://elsewhere.dev/runtime.wasm")).answered).toBeNull();
  });

  it("passes an uncompressed response through unchanged", async () => {
    const plain = new Response(new Uint8Array([1, 2]), { headers: { "content-length": "2" } });
    const handle = loadHandler(plain);
    const { answered } = await handle("https://workouts.mdbase.dev/assets/sqlite3.wasm");
    expect(await answered).toBe(plain);
  });
});
