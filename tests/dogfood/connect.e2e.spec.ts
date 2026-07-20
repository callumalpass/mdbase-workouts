import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const cli = process.env.MDBASE_CONNECT_DOGFOOD_CLI || "/home/calluma/projects/mdbase-connect-dogfood/target/debug/mdbase-connect";
const stateDir = requiredEnvironment("MDBASE_CONNECT_DOGFOOD_STATE_DIR");
const collectionDir = requiredEnvironment("MDBASE_CONNECT_DOGFOOD_COLLECTION_DIR");
const serverUrl = process.env.MDBASE_CONNECT_DOGFOOD_SERVER_URL || "http://localhost:18789";
const userName = process.env.MDBASE_CONNECT_DOGFOOD_USER_NAME || "Workout Dogfood";
const userEmail = process.env.MDBASE_CONNECT_DOGFOOD_USER_EMAIL || "workout-dogfood@localhost.test";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the isolated dogfood test.`);
  return value;
}

async function connector(args: string[]) {
  const result = await run(cli, ["--state-dir", stateDir, "--compact", ...args]);
  const body = JSON.parse(result.stdout);
  if (!body.ok) throw new Error(body.error?.message || "Connector command failed.");
  return body.result;
}

async function eventually<T>(action: () => Promise<T | null>, message: string): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await action();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

test("real workout UI authorizes and writes through MDBASE Connect", async ({ page }) => {
  const quickLogsBefore = (await readdir(`${collectionDir}/quick-logs`)).filter((file) => file.endsWith(".md"));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Open your training record." })).toBeVisible();
  await page.screenshot({ path: "test-results/dogfood-connect-gate.png", animations: "disabled" });

  await page.getByRole("button", { name: "Choose workout collection" }).click();
  await expect(page.getByRole("heading", { name: "Open your account" })).toBeVisible();
  await page.getByLabel("Name").fill(userName);
  await page.getByLabel("Email").fill(userEmail);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "MDBase Workouts" })).toBeVisible();
  await expect(page.getByText("Waiting for a local decision…")).toBeVisible();

  const pending = await eventually(async () => {
    const snapshot = await connector(["access", "snapshot"]);
    return snapshot.pending_authorizations?.find((request: { application_name: string }) => request.application_name === "MDBase Workouts") ?? null;
  }, "Authorization request did not reach the local connector.");
  const collections = await connector(["collection", "list"]);
  const collection = collections.find((item: { display_name: string }) => item.display_name === "MDBase Workouts");
  expect(collection).toBeTruthy();

  await eventually(async () => {
    try {
      return await connector([
        "access", "approve", pending.id, collection.id,
        "--operations", "read,query,create,update,delete",
      ]);
    } catch {
      return null;
    }
  }, "The synchronized collection could not approve the request.");

  // The authorization tab owns the PKCE browser context and returns itself to
  // the application as soon as the local decision reaches the portal.
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /quick log/i })).toBeVisible();
  await page.screenshot({ path: "test-results/dogfood-connected-today.png", animations: "disabled" });

  await page.getByRole("button", { name: /quick log/i }).click();
  await expect(page.getByRole("heading", { name: "Quick Log", exact: true })).toBeVisible();
  await page.getByPlaceholder("Search exercises...").fill("Bench Press");
  await page.getByRole("button", { name: /^Bench Press\b/i }).click();
  const numericInputs = page.locator('input[type="number"]');
  await numericInputs.nth(0).fill("42.5");
  await numericInputs.nth(1).fill("7");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.getByText("42.5kg × 7").first()).toBeVisible();

  const newFile = await eventually(async () => {
    const current = (await readdir(`${collectionDir}/quick-logs`)).filter((file) => file.endsWith(".md"));
    return current.find((file) => !quickLogsBefore.includes(file)) ?? null;
  }, "The quick log was not written to the isolated markdown collection.");
  const markdown = await readFile(`${collectionDir}/quick-logs/${newFile}`, "utf8");
  expect(markdown).toContain("42.5");
  expect(markdown).toContain("7");

  await connector(["access", "pause", "true"]);
  const pausedStatus = await page.evaluate(async (connectUrl) => {
    const key = Object.keys(localStorage).find((item) => item.startsWith("mdbase-connect:token:"));
    if (!key) throw new Error("Connected token was not stored.");
    const token = JSON.parse(localStorage.getItem(key) || "{}");
    const response = await fetch(`${connectUrl}/v1/collections/${token.collectionId}/operations/read`, {
      method: "POST",
      headers: { authorization: `Bearer ${token.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ path: "exercises/squat.md" }),
    });
    return response.status;
  }, serverUrl);
  expect(pausedStatus).toBe(403);
  await connector(["access", "pause", "false"]);

  const activity = await connector(["activity", "--limit", "20"]);
  expect(activity.some((entry: { operation: string; outcome: string }) => entry.operation === "read" && entry.outcome === "denied")).toBe(true);
});
