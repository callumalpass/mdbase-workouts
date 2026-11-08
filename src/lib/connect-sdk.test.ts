import { describe, expect, it } from "vitest";
import { MdbaseConnect } from "@mdbase-dev/sdk";
import manifest from "../generated/mdbase-app.json";
import { workoutDeclaration } from "./connect";

describe("Workouts mdbase SDK declaration", () => {
  it("passes the canonical generated manifest to the SDK unchanged", () => {
    expect(workoutDeclaration.id).toBe(manifest.id);
    expect(workoutDeclaration.name).toBe(manifest.name);
    expect(workoutDeclaration.manifest).toEqual(manifest);
    expect(workoutDeclaration.storage).toEqual({
      applicationNamespace: "mdbase-workouts",
    });
  });

  it("is accepted by the SDK's declaration compiler", () => {
    expect(() => new MdbaseConnect(workoutDeclaration)).not.toThrow();
  });

  it("declares the joint record and file capability groups", () => {
    expect(manifest.requirements.capabilities).toEqual({
      contract_version: 2,
      required: [
        "collection.read",
        "records.create",
        "records.edit",
        "records.delete",
      ],
    });
    expect(manifest.requirements.files).toEqual({
      required: ["list", "read", "add", "replace", "move", "delete"],
      scope: { kind: "collection" },
    });
  });
});
