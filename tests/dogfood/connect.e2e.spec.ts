import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const cli = process.env.MDBASE_CONNECT_DOGFOOD_CLI || "/home/calluma/projects/mdbase-connect-dogfood/target/debug/mdbase-connect";
const stateDir = requiredEnvironment("MDBASE_CONNECT_DOGFOOD_STATE_DIR");
const collectionDir = requiredEnvironment("MDBASE_CONNECT_DOGFOOD_COLLECTION_DIR");
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

test("real workout UI authorizes and writes through mdbase connect", async ({ page }) => {
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
  await page.getByRole("button", { name: "Allow MDBase Workouts" }).click();

  // The authorization tab owns the PKCE browser context and returns itself to
  // the application as soon as the portal records the explicit collection
  // choice and consent.
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /quick log/i })).toBeVisible();
  await page.screenshot({ path: "test-results/dogfood-connected-today.png", animations: "disabled" });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Choose workout collection" })).toHaveCount(0);

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
  try {
    // The live Today view refreshes through the SDK. Pausing Connect must make
    // that real collection query fail closed and leave an auditable denial.
    await expect(
      page.getByText("Application access denied: Remote access is paused on this computer."),
    ).toBeVisible({ timeout: 20_000 });
    await eventually(async () => {
      const activity = await connector(["activity", "--limit", "20"]);
      return activity.find(
        (entry: { operation: string; outcome: string }) =>
          entry.operation === "query" && entry.outcome === "denied",
      ) ?? null;
    }, "The paused SDK query was not recorded in Connect activity.");
  } finally {
    await connector(["access", "pause", "false"]);
  }
});
