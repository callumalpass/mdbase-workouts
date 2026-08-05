import { expect, test } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const cli = process.env.MDBASE_CONNECT_DOGFOOD_CLI || "mdbase";
const stateDir = requiredEnvironment("MDBASE_CONNECT_DOGFOOD_STATE_DIR");
const collectionDir = requiredEnvironment("MDBASE_CONNECT_DOGFOOD_COLLECTION_DIR");
const userName = process.env.MDBASE_CONNECT_DOGFOOD_USER_NAME || "Workout Dogfood";
const userEmail = process.env.MDBASE_CONNECT_DOGFOOD_USER_EMAIL || "workout-dogfood@localhost.test";
const serverUrl = process.env.MDBASE_CONNECT_DOGFOOD_SERVER_URL;
const loopbackPort = process.env.MDBASE_CONNECT_DOGFOOD_LOOPBACK_PORT;
let managedDaemon: ReturnType<typeof spawn> | null = null;

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the isolated dogfood test.`);
  return value;
}

async function connector(args: string[]) {
  const result = await run(cli, ["--state-dir", stateDir, "--json", "connect", ...args]);
  return JSON.parse(result.stdout);
}

async function eventually<T>(action: () => Promise<T | null>, message: string): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await action();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

async function pairIsolatedConnector(page: import("@playwright/test").Page): Promise<void> {
  if (!serverUrl) {
    throw new Error("MDBASE_CONNECT_DOGFOOD_SERVER_URL is required when the isolated connector is not paired.");
  }
  const consentUrl = page.url();
  const child = spawn(cli, [
    "--state-dir", stateDir,
    "connect", "login",
    "--server", serverUrl,
    "--name", "Workout Dogfood Computer",
    "--no-open",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  try {
    const pairingUrl = await new Promise<string>((resolve, reject) => {
      const inspect = (chunk: Buffer) => {
        output += chunk.toString();
        const match = output.match(/https?:\/\/\S+\/pair\/[^\s]+/);
        if (match) resolve(match[0]);
      };
      child.stdout.on("data", inspect);
      child.stderr.on("data", inspect);
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code && !output.match(/https?:\/\/\S+\/pair\/[^\s]+/)) {
          reject(new Error(`Connector pairing exited with ${code}: ${output}`));
        }
      });
    });
    const pairingPage = await page.context().newPage();
    await pairingPage.goto(pairingUrl);
    await expect(pairingPage.getByRole("heading", { name: "Workout Dogfood Computer" })).toBeVisible();
    await pairingPage.getByRole("button", { name: "Approve computer" }).click();
    const exitCode = await childExit(child);
    await pairingPage.close();
    if (exitCode !== 0 && !loopbackPort) {
      throw new Error(`Connector pairing exited with ${exitCode}: ${output}`);
    }
    // `connect login` does not return until its replacement daemon answers a
    // ready probe. Give that process a brief stability window so a daemon that
    // only lived long enough to bind the control socket is not mistaken for a
    // successful restart (for example, if its loopback port is already taken).
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await connector(["status"]);
    } catch {
      if (!loopbackPort) throw new Error("The paired connector did not restart and no dogfood loopback port was provided.");
      managedDaemon = spawn(cli, [
        "--state-dir", stateDir,
        "connect", "daemon", "run",
        "--loopback-port", loopbackPort,
      ], { stdio: ["ignore", "pipe", "pipe"] });
      await eventually(async () => {
        try {
          const status = await connector(["status"]);
          return status.state === "connected" ? status : null;
        } catch {
          return null;
        }
      }, "The paired connector did not restart on the isolated loopback port.");
    }
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await page.goto(consentUrl);
      if (await page.locator('input[type="radio"]').count()) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("The paired connector did not publish its collection to the authorization request.");
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}

function childExit(child: ReturnType<typeof spawn>): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
}

test.afterAll(async () => {
  const daemon = managedDaemon;
  managedDaemon = null;
  if (!daemon || daemon.exitCode !== null) return;
  daemon.kill("SIGINT");
  await childExit(daemon);
});

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
  if (await page.getByText("No compatible collection is ready.").isVisible()) {
    await pairIsolatedConnector(page);
    await expect(page.getByRole("heading", { name: "MDBase Workouts" })).toBeVisible();
  }
  const collection = page.locator('input[type="radio"]').first();
  await expect(collection).toBeAttached();
  if (!(await collection.isChecked())) await collection.check();
  const existingTypeChoices = page.getByRole("radio", { name: /^Use an existing type/ });
  for (const choice of await existingTypeChoices.all()) await choice.check();
  await page.getByRole("button", { name: /allow MDBase Workouts$/i }).click();

  // The authorization tab owns the PKCE browser context and returns itself to
  // the application as soon as the portal records the explicit collection
  // choice and consent.
  const todayHeading = page.getByRole("heading", { name: "Today" });
  const applyDefinitions = page.getByRole("button", { name: "Apply workout definitions" });
  await expect(todayHeading.or(applyDefinitions)).toBeVisible({ timeout: 10_000 });
  if (await applyDefinitions.isVisible()) await applyDefinitions.click();
  await expect(todayHeading).toBeVisible({ timeout: 10_000 });
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

  await connector(["access", "pause"]);
  try {
    // A fresh Today load must query through the SDK. Pausing Connect makes
    // that real collection query fail closed and leaves an auditable denial.
    await page.reload();
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
    await connector(["access", "resume"]);
  }
});
