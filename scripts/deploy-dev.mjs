import { spawnSync } from "node:child_process";

const productionConnectOrigin = "https://connect.mdbase.dev";
const productionApplicationOrigin = "https://callumalpass.github.io";

const applicationOrigin = requiredUrl("MDBASE_WORKOUTS_DEV_ORIGIN");
const connectUrl = requiredUrl("MDBASE_WORKOUTS_DEV_CONNECT_URL");
const loopbackUrl = requiredUrl("MDBASE_WORKOUTS_DEV_LOOPBACK_URL");

if (sameOrigin(connectUrl, productionConnectOrigin)) {
  fail("deploy:dev refuses the production Connect endpoint");
}
if (sameOrigin(applicationOrigin, productionApplicationOrigin)) {
  fail("deploy:dev refuses the production Workouts origin");
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

run("npm", ["run", "build"], environment);
const port = applicationOrigin.port || (applicationOrigin.protocol === "https:" ? "443" : "80");
run(
  "npm",
  ["exec", "vite", "--", "preview", "--host", applicationOrigin.hostname, "--port", port, "--strictPort"],
  environment,
);

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
