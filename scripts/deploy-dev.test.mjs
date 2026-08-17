import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const script = resolve(import.meta.dirname, "deploy-dev.mjs");
const safeEnvironment = {
  ...process.env,
  MDBASE_WORKOUTS_DEV_ORIGIN: "https://mdbase-workouts-staging.pages.dev",
  MDBASE_WORKOUTS_DEV_CONNECT_URL: "https://connect-staging.mdbase.dev",
  MDBASE_WORKOUTS_DEV_LOOPBACK_URL: "http://127.0.0.1:28486",
};

function check(overrides = {}) {
  return spawnSync(process.execPath, [script, "--check"], {
    env: { ...safeEnvironment, ...overrides },
    encoding: "utf8",
  });
}

describe("isolated Workouts staging deployment", () => {
  it("accepts only the recorded staging authority set", () => {
    const result = check();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /configuration is valid/u);
  });

  it("rejects production Connect", () => {
    const result = check({ MDBASE_WORKOUTS_DEV_CONNECT_URL: "https://connect.mdbase.dev" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /refuses the production Connect endpoint/u);
  });

  it("rejects alternate non-production Connect endpoints", () => {
    const result = check({ MDBASE_WORKOUTS_DEV_CONNECT_URL: "https://unrelated.invalid" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /requires the isolated.*Connect endpoint/u);
  });

  it("rejects the production application origin", () => {
    const result = check({ MDBASE_WORKOUTS_DEV_ORIGIN: "https://callumalpass.github.io" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /refuses the production Workouts origin/u);
  });

  it("rejects alternate and non-HTTPS staging origins", () => {
    for (const origin of ["https://unrelated.invalid", "http://mdbase-workouts-staging.pages.dev"]) {
      const result = check({ MDBASE_WORKOUTS_DEV_ORIGIN: origin });
      assert.equal(result.status, 2);
      assert.match(result.stderr, /requires the isolated/u);
    }
  });

  it("rejects missing and malformed required URLs", () => {
    let result = check({ MDBASE_WORKOUTS_DEV_LOOPBACK_URL: "" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /is required/u);

    result = check({ MDBASE_WORKOUTS_DEV_LOOPBACK_URL: "not-a-url" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /must be an absolute URL/u);
  });
});
