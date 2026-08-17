import { spawnSync } from "node:child_process";

const productionConnectOrigin = "https://connect.mdbase.dev";
const productionApplicationOrigin = "https://callumalpass.github.io";
const stagingConnectOrigin = "https://connect-staging.mdbase.dev";
const stagingProject = "mdbase-workouts-staging";
const stagingApplicationOrigin = `https://${stagingProject}.pages.dev`;

const applicationOrigin = requiredUrl("MDBASE_WORKOUTS_DEV_ORIGIN");
const connectUrl = requiredUrl("MDBASE_WORKOUTS_DEV_CONNECT_URL");
const loopbackUrl = requiredUrl("MDBASE_WORKOUTS_DEV_LOOPBACK_URL");

if (sameOrigin(connectUrl, productionConnectOrigin)) {
  fail("deploy:dev refuses the production Connect endpoint");
}
if (connectUrl.origin !== stagingConnectOrigin) {
  fail(`deploy:dev requires the isolated ${stagingConnectOrigin} Connect endpoint`);
}
if (sameOrigin(applicationOrigin, productionApplicationOrigin)) {
  fail("deploy:dev refuses the production Workouts origin");
}
if (applicationOrigin.origin !== stagingApplicationOrigin) {
  fail(`deploy:dev requires the isolated ${stagingApplicationOrigin} origin`);
}

if (process.argv.includes("--check")) {
  console.log("Workouts isolated dev deployment configuration is valid.");
  process.exit(0);
}

const environment = {
  ...process.env,
  MDBASE_WORKOUTS_ORIGIN: applicationOrigin.href.replace(/\/$/, ""),
  MDBASE_WORKOUTS_BASE_PATH: "/",
  VITE_MDBASE_CONNECT: "1",
  VITE_MDBASE_CONNECT_STAGING: "1",
  VITE_MDBASE_CONNECT_URL: connectUrl.href.replace(/\/$/, ""),
  VITE_MDBASE_CONNECT_LOOPBACK_URL: loopbackUrl.href.replace(/\/$/, ""),
};

// The isolated deployment deliberately uses a loopback application origin.
// Keep the same manifest checks as a production build while narrowly allowing
// loopback URLs, then invoke Vite directly so `npm run build` cannot re-run the
// production-only manifest validator.
run("npm", ["run", "manifest"], environment);
run(
  "npm",
  [
    "exec",
    "mdbase-connect-dev",
    "--",
    "validate-manifest",
    "public/.well-known/mdbase-app.json",
    "--allow-local",
  ],
  environment,
);
run("npm", ["exec", "vite", "--", "build"], environment);
run(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "--yes",
    "wrangler@4.120.0",
    "pages",
    "deploy",
    "dist",
    "--project-name",
    stagingProject,
    "--branch",
    "main",
    "--commit-dirty=true",
  ],
  environment,
);
await verifyLiveDeployment();

async function verifyLiveDeployment() {
  const manifestUrl = `${stagingApplicationOrigin}/.well-known/mdbase-app.json`;
  let lastFailure = "no response";
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const response = await fetch(manifestUrl, { cache: "no-store" });
      if (!response.ok) {
        lastFailure = `HTTP ${String(response.status)}`;
      } else {
        const manifest = await response.json();
        const homepage = `${stagingApplicationOrigin}/`;
        if (
          manifest.homepage === homepage &&
          manifest.redirect_uris?.length === 1 &&
          manifest.redirect_uris[0] === homepage
        ) {
          console.log(`Workouts staging manifest is live at ${manifestUrl}.`);
          return;
        }
        lastFailure = "homepage or redirect URI did not match the staging root";
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  fail(`Workouts staging deployment could not be verified: ${lastFailure}`);
}

function requiredUrl(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is required; deploy:dev has no production fallback`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be an absolute URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail(`${name} must use http or https`);
  }
  return parsed;
}

function sameOrigin(value, expected) {
  return value.origin === new URL(expected).origin;
}

function run(command, args, env) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
