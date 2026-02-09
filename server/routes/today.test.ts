import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import today from "./today";

type QueryArgs = {
  types: string[];
  where?: string;
};

function buildMockDb() {
  const plans = [
    {
      path: "plans/2026-02-09-morning.md",
      frontmatter: { date: "2026-02-09", title: "Morning", status: "scheduled", exercises: [] },
    },
    {
      path: "plans/2026-02-08-evening.md",
      frontmatter: { date: "2026-02-08", title: "Evening", status: "scheduled", exercises: [] },
    },
  ];

  const sessions = [
    {
      path: "sessions/s1.md",
      frontmatter: {
        date: "2026-02-08T18:30:00.000Z", // 05:30 on Feb 9 in Melbourne
        exercises: [],
      },
    },
    {
      path: "sessions/s2.md",
      frontmatter: {
        date: "2026-02-08T12:00:00.000Z", // 23:00 on Feb 8 in Melbourne
        exercises: [],
      },
    },
  ];

  const quickLogs = [
    {
      path: "quick-logs/q1.md",
      frontmatter: {
        exercise: "[[exercises/squat]]",
        logged_at: "2026-02-08T19:10:00.000Z", // 06:10 on Feb 9 in Melbourne
      },
    },
    {
      path: "quick-logs/q2.md",
      frontmatter: {
        exercise: "[[exercises/squat]]",
        logged_at: "2026-02-08T10:00:00.000Z", // 21:00 on Feb 8 in Melbourne
      },
    },
  ];

  return {
    async query({ types, where }: QueryArgs) {
      const type = types[0];
      if (type === "plan") {
        const match = where?.match(/date == "([^"]+)"/);
        const date = match?.[1];
        const results = date ? plans.filter((p) => p.frontmatter.date === date) : plans;
        return { results };
      }
      if (type === "session") return { results: sessions };
      if (type === "quick-log") return { results: quickLogs };
      if (type === "plan-template") return { results: [] };
      return { results: [] };
    },
  };
}

function buildApp() {
  const app = new Hono();
  const db = buildMockDb();

  app.use("*", async (c, next) => {
    c.set("db", db as any);
    await next();
  });
  app.route("/today", today);
  return app;
}

describe("GET /today timezone filtering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-02-08 19:00:00Z == 2026-02-09 06:00:00 in Australia/Melbourne (AEDT)
    vi.setSystemTime(new Date("2026-02-08T19:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns local-day records for Melbourne at early morning", async () => {
    const app = buildApp();
    const res = await app.request("/today?timezone=Australia%2FMelbourne");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.date).toBe("2026-02-09");
    expect(body.plans.map((p: any) => p.path)).toEqual(["plans/2026-02-09-morning.md"]);
    expect(body.sessions.map((s: any) => s.path)).toEqual(["sessions/s1.md"]);
    expect(body.quickLogs.map((q: any) => q.path)).toEqual(["quick-logs/q1.md"]);
  });

  it("falls back to UTC for invalid timezone values", async () => {
    const app = buildApp();
    const res = await app.request("/today?timezone=not-a-real-timezone");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.date).toBe("2026-02-08");
    expect(body.sessions.map((s: any) => s.path)).toEqual(["sessions/s1.md", "sessions/s2.md"]);
  });
});
