import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Collection,
  applyTypePack,
  assessTypePack,
} from "@callumalpass/mdbase";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const projectRoot = resolve(import.meta.dirname, "..");
const manifestPath = resolve(
  projectRoot,
  "public",
  ".well-known",
  "mdbase-app.json",
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const schemaPath = fileURLToPath(
  import.meta.resolve(
    "@mdbase-dev/connect-protocol/schemas/mdbase-app.schema.json",
  ),
);
const schema = JSON.parse(await readFile(schemaPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

if (!ajv.validate(schema, manifest)) {
  fail(`App manifest is invalid:\n${ajv.errorsText(ajv.errors, {
    separator: "\n",
  })}`);
}

const packs = manifest.provisions?.type_packs;
if (!Array.isArray(packs) || packs.length !== 1) {
  fail("The app manifest must contain exactly one transactional type pack.");
}
const pack = packs[0];
const sources = new Map(
  pack.resources.map((resource) => [resource.source, resource.document]),
);
for (const resource of pack.manifest.resources) {
  const document = sources.get(resource.source);
  if (typeof document !== "string") {
    fail(`Type-pack source '${resource.source}' is missing.`);
  }
  const actual = digest(document);
  if (actual !== resource.digest) {
    fail(
      `Type-pack source '${resource.source}' has digest ${actual}; expected ${resource.digest}.`,
    );
  }
}

const collectionRoot = await mkdtemp(
  join(tmpdir(), "mdbase-workouts-type-pack-"),
);
try {
  await writeFile(
    join(collectionRoot, "mdbase.yaml"),
    "spec_version: 0.3.0\nsettings:\n  validation: error\n",
  );

  const provision = { manifest: pack.manifest, resources: pack.resources };
  const assessment = await assessTypePack(collectionRoot, provision, {
    installedBy: "dev.mdbase.workouts",
  });
  assertValid(assessment, "assessment");
  if (
    assessment.result.resources.length !== 10 ||
    assessment.result.resources.some(({ action }) => action !== "create")
  ) {
    fail("The type-pack assessment must report ten creates.");
  }

  const installed = await applyTypePack(collectionRoot, provision, {
    installedBy: "dev.mdbase.workouts",
    expectedAssessmentDigest: assessment.result.assessment_digest,
  });
  assertValid(installed, "install");
  const repeatedAssessment = await assessTypePack(collectionRoot, provision, {
    installedBy: "dev.mdbase.workouts",
  });
  assertValid(repeatedAssessment, "repeat assessment");
  const repeated = await applyTypePack(collectionRoot, provision, {
    installedBy: "dev.mdbase.workouts",
    expectedAssessmentDigest: repeatedAssessment.result.assessment_digest,
  });
  assertValid(repeated, "repeat install");
  if (
    repeated.result.resources.some(
      ({ action }) => action !== "unchanged" && action !== "preserve",
    )
  ) {
    fail("Reapplying the exact same type pack must preserve seeded user resources.");
  }

  await mkdir(join(collectionRoot, "exercises"));
  await writeFile(
    join(collectionRoot, "exercises", "bench-press.md"),
    "---\ntype: exercise\nname: Bench Press\nmuscle_groups: [chest]\nequipment: barbell\ntracking: weight_reps\n---\n",
  );
  const opened = await Collection.open(collectionRoot);
  if (!opened.collection || opened.error) {
    fail(`The installed collection did not open: ${opened.error?.message}`);
  }
  try {
    for (const requirement of manifest.requirements.contracts) {
      const implementations = opened.collection.getDataContractImplementations(
        requirement.id,
        requirement.version,
      );
      if (implementations.length !== 1) {
        fail(
          `${requirement.id} ${requirement.version} should have one installed implementation; found ${implementations.length}.`,
        );
      }
    }
    const exerciseView = await opened.collection.getContractView(
      "exercises/bench-press.md",
      "mdbase.workouts.exercise",
      "1.0.0",
    );
    if (!exerciseView.valid || exerciseView.view.name !== "Bench Press") {
      fail("The installed exercise implementation did not project a valid normalized view.");
    }
  } finally {
    await opened.collection.close();
  }
} finally {
  await rm(collectionRoot, { recursive: true, force: true });
}

console.log(
  "mdbase Workouts manifest and transactional type pack verified (10 resources, 5 contracts).",
);

function digest(document) {
  return `sha256:${createHash("sha256").update(document).digest("hex")}`;
}

function assertValid(result, operation) {
  if (!result.valid) {
    fail(
      `Type-pack ${operation} failed: ${result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`,
    );
  }
}

function fail(message) {
  throw new Error(message);
}
