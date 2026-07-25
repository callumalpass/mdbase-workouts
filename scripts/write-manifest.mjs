import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultOrigin = "https://callumalpass.github.io";
const defaultBasePath = "/mdbase-workouts/";
const origin = (process.env.MDBASE_WORKOUTS_ORIGIN ?? defaultOrigin).replace(/\/$/, "");
const basePath = normalizeBasePath(process.env.MDBASE_WORKOUTS_BASE_PATH ?? defaultBasePath);
const appUrl = new URL(basePath, `${origin}/`).href;
const projectRoot = resolve(import.meta.dirname, "..");
const target = resolve(projectRoot, "public", ".well-known", "mdbase-app.json");
const requiredTypes = [
  { name: "exercise", contract: "mdbase.workouts.exercise" },
  { name: "plan", contract: "mdbase.workouts.plan" },
  { name: "plan-template", contract: "mdbase.workouts.plan-template" },
  { name: "quick-log", contract: "mdbase.workouts.quick-log" },
  { name: "session", contract: "mdbase.workouts.session" },
];
const provisions = await Promise.all(requiredTypes.map(async ({ name, contract }) => ({
  name,
  path: `_types/${name}.md`,
  document: await readFile(resolve(projectRoot, "data", "_types", `${name}.md`), "utf8"),
  provides: [{ id: contract, version: 1 }],
})));

await mkdir(resolve(target, ".."), { recursive: true });
await writeFile(target, `${JSON.stringify({
  manifest_version: 3,
  id: "dev.mdbase.workouts",
  name: "MDBase Workouts",
  homepage: appUrl,
  redirect_uris: [appUrl],
  requirements: {
    contracts: requiredTypes.map(({ contract }) => ({ id: contract, version: 1 })),
  },
  provisions: {
    types: provisions,
  },
}, null, 2)}\n`);

function normalizeBasePath(value) {
  return `/${value.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
}
