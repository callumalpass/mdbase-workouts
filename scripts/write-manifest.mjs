import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultOrigin = "https://callumalpass.github.io";
const defaultBasePath = "/mdbase-workouts/";
const origin = (process.env.MDBASE_WORKOUTS_ORIGIN ?? defaultOrigin).replace(/\/$/, "");
const basePath = normalizeBasePath(process.env.MDBASE_WORKOUTS_BASE_PATH ?? defaultBasePath);
const appUrl = new URL(basePath, `${origin}/`).href;
const target = resolve(import.meta.dirname, "..", "public", ".well-known", "mdbase-app.json");

await mkdir(resolve(target, ".."), { recursive: true });
await writeFile(target, `${JSON.stringify({
  manifest_version: 1,
  name: "MDBase Workouts",
  homepage: appUrl,
  redirect_uris: [appUrl],
  requirements: {
    contracts: [
      { id: "mdbase.workouts.exercise", version: 1 },
      { id: "mdbase.workouts.plan", version: 1 },
      { id: "mdbase.workouts.plan-template", version: 1 },
      { id: "mdbase.workouts.quick-log", version: 1 },
      { id: "mdbase.workouts.session", version: 1 },
    ],
  },
}, null, 2)}\n`);

function normalizeBasePath(value) {
  return `/${value.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
}
