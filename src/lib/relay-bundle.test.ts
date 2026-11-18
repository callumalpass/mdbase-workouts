// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rollup, type TreeshakingOptions } from "rollup";
import config from "../../vite.config";

/**
 * The SDK's relay carrier is created with `onmessage: null` and handed out
 * through a Promise's resolve(); the SDK sets the handler afterwards. Rollup's
 * default tree-shaking decides the property is always null and deletes the call
 * that delivers each relay message, so a Private collection never finishes
 * opening in a production build. These bundle the SDK's own module with the
 * app's settings and check the call is still there.
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

const delivers = /carrier\.onmessage\?\.\(b\.slice/;

function treeshakeOf(options: unknown): TreeshakingOptions {
  const value = (options as { rollupOptions?: { treeshake?: unknown } } | undefined)?.rollupOptions?.treeshake;
  expect(value).toBeTypeOf("object");
  return value as TreeshakingOptions;
}

describe("production bundling of the SDK's relay pipe", () => {
  it("drops the relay message handler under Rollup's default tree-shaking", async () => {
    // Guards the premise: if Rollup stops doing this, the setting can go.
    expect(await bundled(undefined)).not.toMatch(delivers);
  });

  it("keeps it with the page build's settings", async () => {
    expect(await bundled(treeshakeOf(config.build))).toMatch(delivers);
  });

  it("keeps it with the worker build's settings", async () => {
    expect(await bundled(treeshakeOf(config.worker))).toMatch(delivers);
  });
});
