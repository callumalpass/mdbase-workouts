import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { dataContractDigest } from "@callumalpass/mdbase";
import { parse as parseYaml } from "yaml";

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
const packResources = (
  await Promise.all(
    requiredTypes.map(async ({ name, contract }) => {
      const contractSource = `contracts/${contract}.md`;
      const typeSource = `types/${name}.md`;
      const contractDocument = await readFile(
        resolve(projectRoot, "data", "_contracts", `${contract}.md`),
        "utf8",
      );
      const typeDocument = await readFile(
        resolve(projectRoot, "data", "_types", `${name}.md`),
        "utf8",
      );
      return [
        {
          kind: "contract",
          mode: "managed",
          source: contractSource,
          target: `_contracts/${contract}.md`,
          digest: digest(contractDocument),
          contractDigest: dataContractDigest(parseFrontmatter(contractDocument)),
          document: contractDocument,
        },
        {
          kind: "type",
          mode: "seed",
          source: typeSource,
          target: `_types/${name}.md`,
          digest: digest(typeDocument),
          document: typeDocument,
        },
      ];
    }),
  )
).flat();
const contractDigests = new Map(
  packResources
    .filter((resource) => resource.kind === "contract")
    .map((resource) => [resource.source.slice("contracts/".length, -".md".length), resource.contractDigest]),
);
const requirement = ({ contract }) => {
  const contractDigest = contractDigests.get(contract);
  if (!contractDigest) throw new Error(`No contract digest was generated for ${contract}.`);
  return { id: contract, version: "1.0.0", digest: contractDigest };
};

await mkdir(resolve(target, ".."), { recursive: true });
await writeFile(target, `${JSON.stringify({
  manifest_version: 1,
  id: "dev.mdbase.workouts",
  name: "MDBase Workouts",
  homepage: appUrl,
  redirect_uris: [appUrl],
  requirements: {
    access: "full_collection",
    contracts: requiredTypes.map(requirement),
    capabilities: {
      contract_version: 1,
      required: [
        "collection.inspect",
        "records.read",
        "records.query",
        "records.create",
        "records.update",
        "records.delete",
        "definitions.contracts.current",
        "definitions.type-pack.apply",
      ],
    },
  },
  provisions: {
    type_packs: [
      {
        provides: requiredTypes.map(requirement),
        manifest: {
          kind: "mdbase.type-pack",
          id: "mdbase.workouts",
          version: "1.0.0",
          name: "mdbase Workouts",
          description:
            "Portable workout contracts and the app's default implementations.",
          resources: packResources.map(
            ({ document: _document, contractDigest: _contractDigest, ...resource }) => resource,
          ),
        },
        resources: packResources.map(({ source, document }) => ({
          source,
          document,
        })),
      },
    ],
  },
}, null, 2)}\n`);

function digest(document) {
  return `sha256:${createHash("sha256").update(document).digest("hex")}`;
}

function parseFrontmatter(document) {
  const match = document.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error("Contract resource has no YAML frontmatter.");
  return parseYaml(match[1]);
}

function normalizeBasePath(value) {
  return `/${value.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
}
