import { Hono } from "hono";
import "../lib/context.js";
import { dateKeyInTimeZone, resolveTimeZone } from "../lib/timezone.js";
import { parsePositiveIntQuery } from "../lib/validation.js";

const today = new Hono();

today.get("/", async (c) => {
  const db = c.get("db");
  const timeZone = resolveTimeZone(c.req.query("timezone"));
  const todayStr = dateKeyInTimeZone(new Date(), timeZone) || "1970-01-01";
  const lookbackLimit = parsePositiveIntQuery(c.req.query("limit"), 250, 1000);

  // Fetch records in parallel, then apply timezone-aware day filtering in memory.
  const [plansResult, sessionsResult, quickLogsResult, templatesResult] = await Promise.all([
    db.query({
      types: ["plan"],
      where: `date == "${todayStr}"`,
      order_by: [{ field: "date", direction: "asc" }],
      include_body: false,
    }),
    db.query({
      types: ["session"],
      order_by: [{ field: "date", direction: "desc" }],
      limit: lookbackLimit,
      include_body: false,
    }),
    db.query({
      types: ["quick-log"],
      order_by: [{ field: "logged_at", direction: "desc" }],
      limit: lookbackLimit,
      include_body: false,
    }),
    db.query({
      types: ["plan-template"],
      include_body: false,
    }),
  ]);

  if (plansResult.error) return c.json({ error: plansResult.error.message }, 500);
  if (sessionsResult.error) return c.json({ error: sessionsResult.error.message }, 500);
  if (quickLogsResult.error) return c.json({ error: quickLogsResult.error.message }, 500);
  if (templatesResult.error) return c.json({ error: templatesResult.error.message }, 500);

  return c.json({
    date: todayStr,
    plans: (plansResult.results || []).map((r) => ({
      path: r.path,
      ...r.frontmatter,
    })),
    sessions: (sessionsResult.results || [])
      .filter((r) => {
        const date = (r.frontmatter as any)?.date;
        return dateKeyInTimeZone(date, timeZone) === todayStr;
      })
      .map((r) => ({
        path: r.path,
        ...r.frontmatter,
      })),
    quickLogs: (quickLogsResult.results || [])
      .filter((r) => {
        const loggedAt = (r.frontmatter as any)?.logged_at;
        return dateKeyInTimeZone(loggedAt, timeZone) === todayStr;
      })
      .map((r) => ({
        path: r.path,
        ...r.frontmatter,
      })),
    templates: (templatesResult.results || []).map((r) => ({
      path: r.path,
      ...r.frontmatter,
    })),
  });
});

export default today;
