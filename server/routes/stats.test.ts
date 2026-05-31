import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import stats from "./stats";

type QueryArgs = {
  types: string[];
};

function buildMockDb(todayActive = false) {
  const sessions = [
    {
      path: "sessions/20260526.md",
      frontmatter: { date: "2026-05-26T10:00:00.000Z", exercises: [] },
    },
    {
      path: "sessions/20260529.md",
      frontmatter: { date: "2026-05-29T09:00:00.000Z", exercises: [] },
    },
  ];

  const quickLogs = [
    {
      path: "quick-logs/20260527.md",
      frontmatter: {
        exercise: "[[exercises/pull-up]]",
        logged_at: "2026-05-27T09:00:00.000Z",
      },
    },
    {
      path: "quick-logs/20260528.md",
      frontmatter: {
        exercise: "[[exercises/pull-up]]",
        logged_at: "2026-05-28T09:00:00.000Z",
      },
    },
  ];

  if (todayActive) {
    quickLogs.push({
      path: "quick-logs/20260531.md",
      frontmatter: {
        exercise: "[[exercises/pull-up]]",
        logged_at: "2026-05-31T09:00:00.000Z",
      },
    });
  }

  return {
    async query({ types }: QueryArgs) {
      const type = types[0];
      if (type === "session") return { results: sessions };
      if (type === "quick-log") return { results: quickLogs };
      if (type === "exercise") return { results: [] };
      return { results: [] };
    },
  };
}

function buildApp(todayActive = false) {
  const app = new Hono();
  const db = buildMockDb(todayActive);

  app.use("*", async (c, next) => {
    c.set("db", db as any);
    await next();
  });
  app.route("/stats", stats);
  return app;
}

describe("GET /stats run status", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-31T06:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks today as a hinge day when the run can still be recovered", async () => {
    const app = buildApp();
    const res = await app.request("/stats?timezone=Australia%2FMelbourne");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.streak.currentStreak).toBe(0);
    expect(body.streak.runStatus).toEqual({
      kind: "hinge-day",
      todayActive: false,
      quietDays: 2,
      lastActiveDate: "2026-05-29",
      recoverableStreak: 5,
    });
  });

  it("returns to active once today has a workout entry", async () => {
    const app = buildApp(true);
    const res = await app.request("/stats?timezone=Australia%2FMelbourne");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.streak.currentStreak).toBe(5);
    expect(body.streak.runStatus).toEqual({
      kind: "active",
      todayActive: true,
      quietDays: 0,
      lastActiveDate: "2026-05-31",
      recoverableStreak: null,
    });
  });
});
