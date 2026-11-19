// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rollup, type TreeshakingOptions } from "rollup";
import config from "../../vite.config";

/**
 * The SDK's relay carrier is handed out through a Promise's resolve(); the SDK
 * sets the message handler afterwards. Up to SDK 0.1.14 the carrier was created
 * with `onmessage: null`, and Rollup's default tree-shaking decided the property
 * was always null and deleted the call that delivers each relay message, so a
 * Private collection never finished opening in a production build. SDK 0.1.19
 * keeps the handlers behind accessors so the call survives. These bundle the
 * SDK's own module and check the call is still there, with Rollup's defaults and
 * with the app's settings.
 */
async function bundled(treeshake: TreeshakingOptions | undefined): Promise<string> {
  const build = await rollup({
    input: "@mdbase-dev/sdk/dist/transport/relay-pipe.js",
    treeshake,
    external: (id) => !id.includes("relay-pipe"),
    plugins: [{
      name: "resolve-sdk",
      resolveId: (id) => id.startsWith("@mdbase-dev/sdk/")
        ? new URL(`../../node_modules/${id}`, import.meta.url).pathname
        : null,
    }],
  });
  const { output } = await build.generate({ format: "es" });
  await build.close();
  return output[0].code;
}

// `carrier.onmessage?.(…)` in SDK 0.1.14, `onmessage?.(…)` in 0.1.19.
const delivers = /onmessage\?\.\(b\.slice/;

function treeshakeOf(options: unknown): TreeshakingOptions {
  const value = (options as { rollupOptions?: { treeshake?: unknown } } | undefined)?.rollupOptions?.treeshake;
  expect(value).toBeTypeOf("object");
  return value as TreeshakingOptions;
}

describe("production bundling of the SDK's relay pipe", () => {
  it("keeps it under Rollup's default tree-shaking", async () => {
    // The SDK's own fix (seen in 0.1.19); the app's setting below is now a second guard.
    expect(await bundled(undefined)).toMatch(delivers);
  });

  it("keeps it with the page build's settings", async () => {
    expect(await bundled(treeshakeOf(config.build))).toMatch(delivers);
  });

  it("keeps it with the worker build's settings", async () => {
    expect(await bundled(treeshakeOf(config.worker))).toMatch(delivers);
  });
});
