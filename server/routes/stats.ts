import { Hono } from "hono";
import "../lib/context.js";
import { resolveTimeZone } from "../lib/timezone.js";
import { parsePositiveIntQuery } from "../lib/validation.js";
import { computeWorkoutStats, computeWorkoutWeeklyStats } from "../../src/lib/workout-stats.js";
import type { Exercise, QuickLog, Session } from "../../src/lib/types.js";

const stats = new Hono();

stats.get("/", async (c) => {
  const db = c.get("db");
  const timeZone = resolveTimeZone(c.req.query("timezone"));
  const limit = parsePositiveIntQuery(c.req.query("limit"), 5000, 20000);
  const [sessions, exercises, quickLogs] = await Promise.all([
    db.query({ types: ["session"], order_by: [{ field: "date", direction: "desc" }], limit, include_body: false }),
    db.query({ types: ["exercise"], include_body: false }),
    db.query({ types: ["quick-log"], limit, include_body: false }),
  ]);
  if (sessions.error) return c.json({ error: sessions.error.message }, 500);
  if (exercises.error) return c.json({ error: exercises.error.message }, 500);
  if (quickLogs.error) return c.json({ error: quickLogs.error.message }, 500);
  return c.json(computeWorkoutStats({
    sessions: records<Session>(sessions.results),
    exercises: records<Exercise>(exercises.results),
    quickLogs: records<QuickLog>(quickLogs.results),
    timeZone,
  }));
});

stats.get("/weekly", async (c) => {
  const db = c.get("db");
  const timeZone = resolveTimeZone(c.req.query("timezone"));
  const [sessions, quickLogs] = await Promise.all([
    db.query({ types: ["session"], limit: 20000, include_body: false }),
    db.query({ types: ["quick-log"], limit: 20000, include_body: false }),
  ]);
  if (sessions.error) return c.json({ error: sessions.error.message }, 500);
  if (quickLogs.error) return c.json({ error: quickLogs.error.message }, 500);
  return c.json(computeWorkoutWeeklyStats({
    sessions: records<Session>(sessions.results),
    quickLogs: records<QuickLog>(quickLogs.results),
    timeZone,
  }));
});

function records<T>(rows: Array<{ path: string; frontmatter: unknown }> | undefined): T[] {
  return (rows ?? []).map((row) => ({ path: row.path, ...(row.frontmatter as object) }) as T);
}

export default stats;
