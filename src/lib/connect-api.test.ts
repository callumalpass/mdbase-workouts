import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp, type MemoryContract, type TestApp } from "@mdbase-dev/sdk/testing";
import { connectApi, invalidateConnectApiCache } from "./connect-api";
import {
  setWorkoutEntryForTests,
  workoutDeclaration,
} from "./connect";

const CONTRACTS = [
  ["exercise", ["name", "muscle_groups", "equipment", "tracking", "category", "notes"]],
  ["plan", ["date", "title", "status", "exercises", "notes", "session"]],
  ["plan-template", ["title", "exercises", "notes"]],
  ["quick-log", ["exercise", "logged_at", "reps", "weight", "duration_seconds", "distance", "notes"]],
  ["session", ["date", "exercises", "duration_minutes", "plan", "rating", "notes"]],
] as const;

const contracts: MemoryContract[] = CONTRACTS.map(([type, fields]) => ({
  id: `mdbase.workouts.${type}`,
  version: "1.0.0",
  type,
  fields: Object.fromEntries(fields.map((field) => [field, field])),
}));

let app: TestApp | null = null;

async function testApp(options: {
  records?: Array<{
    path: string;
    types?: string[];
    frontmatter?: Record<string, unknown>;
  }>;
  contracts?: MemoryContract[];
} = {}): Promise<TestApp> {
  app = await createTestApp({
    declaration: workoutDeclaration,
    collections: [{
      name: "Workouts",
      contracts: options.contracts ?? contracts,
      records: (options.records ?? []) as never,
    }],
  });
  setWorkoutEntryForTests(app.mdbase);
  invalidateConnectApiCache();
  return app;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await app?.close();
  app = null;
  vi.restoreAllMocks();
});

describe("workout contract access", () => {
  it("unwraps contract projections into workout records", async () => {
    await testApp({
      records: [{
        path: "exercises/bench-press.md",
        types: ["exercise"],
        frontmatter: {
          name: "Bench Press",
          muscle_groups: ["chest"],
          equipment: "barbell",
          tracking: "weight_reps",
        },
      }],
    });

    expect(await connectApi.exercises.list()).toEqual([{
      path: "exercises/bench-press.md",
      name: "Bench Press",
      muscle_groups: ["chest"],
      equipment: "barbell",
      tracking: "weight_reps",
    }]);
  });

  it("creates, updates, and deletes through contract mappings", async () => {
    await testApp();

    const created = await connectApi.exercises.create({
      name: "Back Squat",
      muscle_groups: ["legs"],
      equipment: "barbell",
      tracking: "weight_reps",
    });
    expect(created).toMatchObject({
      path: "exercises/back-squat.md",
      name: "Back Squat",
      revision: expect.stringMatching(/^sha256:/),
    });

    const updated = await connectApi.exercises.update("back-squat", { equipment: "smith machine" });
    expect(updated).toMatchObject({ path: "exercises/back-squat.md", equipment: "smith machine" });

    const session = await connectApi.sessions.create({
      date: "2026-11-08",
      exercises: [{ exercise: "back-squat", sets: [{ reps: 5, weight: 100 }] }],
    });
    expect(session).toMatchObject({
      path: expect.stringMatching(/^sessions\/.+\.md$/),
      date: "2026-11-08",
    });

    expect(await connectApi.sessions.delete(session.path.replace(/^sessions\/|\.md$/g, "")))
      .toEqual({ ok: true });
    expect(await connectApi.sessions.list()).toMatchObject({ total: 0, sessions: [] });
  });

  it("pages every contract result", async () => {
    const records = Array.from({ length: 200 }, (_, index) => ({
      path: `sessions/session-${String(index).padStart(3, "0")}.md`,
      types: ["session"],
      frontmatter: {
        date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
        exercises: [],
      },
    }));
    await testApp({ records });

    const page = await connectApi.sessions.list(500);
    expect(page.total).toBe(200);
    expect(page.sessions).toHaveLength(200);
  });

  it("selects the app's provider when several implement one contract", async () => {
    const withAlternative = [
      ...contracts,
      {
        id: "mdbase.workouts.exercise",
        version: "1.0.0",
        type: "exercise-alt",
        fields: Object.fromEntries(
          CONTRACTS[0][1].map((field) => [field, field]),
        ),
      },
    ];
    const test = await testApp({ contracts: withAlternative });

    await connectApi.exercises.create({
      name: "Dip",
      muscle_groups: ["triceps"],
      equipment: "bodyweight",
      tracking: "reps_only",
    });

    const view = await test.client().get({ path: "exercises/dip.md" });
    expect(view.types).toEqual(["exercise"]);
    expect(await connectApi.exercises.get("dip")).toMatchObject({ name: "Dip" });
  });

  it("shares collection scans between dashboard reads", async () => {
    const test = await testApp({
      records: [{
        path: "exercises/bench-press.md",
        types: ["exercise"],
        frontmatter: {
          name: "Bench Press",
          muscle_groups: ["chest"],
          equipment: "barbell",
          tracking: "weight_reps",
        },
      }],
    });
    const query = vi.spyOn(test.client(), "queryContract");

    await Promise.all([connectApi.today(), connectApi.today()]);

    // exercise, session, quick-log, and plan-template: one scan each.
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("reports the opened collection through settings", async () => {
    const test = await testApp();
    const settings = await connectApi.settings.get();
    expect(settings.collectionName).toBe("Workouts");
    expect(settings.dataDir).toBe(test.client().collection);
  });
});
