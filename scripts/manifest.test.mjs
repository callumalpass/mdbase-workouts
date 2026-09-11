import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { dataContractDigest } from "@callumalpass/mdbase";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "public/.well-known/mdbase-app.json"), "utf8"));

test("Workouts requests only v2 collection read and record CRUD groups", () => {
  assert.equal(manifest.manifest_version, 1);
  assert.deepEqual(manifest.requirements.capabilities, {
    contract_version: 2,
    required: ["collection.read", "records.create", "records.edit", "records.delete"],
  });
  assert.equal(manifest.requirements.access, "full_collection");
  assert.equal(Object.hasOwn(manifest.requirements, "files"), false);
});

test("bundled setup preserves exact resource bytes, modes, and contract digests", async () => {
  assert.equal(manifest.provisions.type_packs.length, 1);
  const pack = manifest.provisions.type_packs[0];
  assert.equal(pack.manifest.id, "mdbase.workouts");
  assert.equal(pack.manifest.version, "1.0.0");
  assert.equal(pack.manifest.resources.length, 10);
  assert.equal(pack.resources.length, 10);
  assert.equal(manifest.requirements.contracts.length, 5);
  assert.deepEqual(pack.provides, manifest.requirements.contracts);
  for (const resource of pack.manifest.resources) {
    const document = await readFile(resolve(root, "data", resource.target), "utf8");
    assert.equal(pack.resources.find(({ source }) => source === resource.source)?.document, document);
    assert.equal(resource.digest, `sha256:${createHash("sha256").update(document).digest("hex")}`);
    assert.equal(resource.target, `_${resource.source}`);
    assert.equal(resource.mode, resource.kind === "contract" ? "managed" : "seed");
    if (resource.kind === "contract") {
      const frontmatter = parse(document.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)[1]);
      const id = resource.source.slice("contracts/".length, -".md".length);
      assert.deepEqual(pack.provides.find((requirement) => requirement.id === id), {
        id, version: "1.0.0", digest: dataContractDigest(frontmatter),
      });
    }
  }
});
