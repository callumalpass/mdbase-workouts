import { Hono } from "hono";
import "../lib/context.js";

const today = new Hono();

today.get("/", async (c) => {
  const db = c.get("db");
  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch today's plans, sessions, recent quick logs, and all templates in parallel
  const [plansResult, sessionsResult, quickLogsResult, templatesResult] = await Promise.all([
    db.query({
      types: ["plan"],
      where: `date.startsWith("${todayStr}")`,
      order_by: [{ field: "date", direction: "asc" }],
      include_body: false,
    }),
    db.query({
      types: ["session"],
      where: `date.startsWith("${todayStr}")`,
      order_by: [{ field: "date", direction: "desc" }],
      include_body: false,
    }),
    db.query({
      types: ["quick-log"],
      where: `logged_at.startsWith("${todayStr}")`,
      order_by: [{ field: "logged_at", direction: "desc" }],
      limit: 20,
      include_body: false,
    }),
    db.query({
      types: ["plan-template"],
      include_body: false,
    }),
  ]);

  return c.json({
    date: todayStr,
    plans: (plansResult.results || []).map((r) => ({
      path: r.path,
      ...r.frontmatter,
    })),
    sessions: (sessionsResult.results || []).map((r) => ({
      path: r.path,
      ...r.frontmatter,
    })),
    quickLogs: (quickLogsResult.results || []).map((r) => ({
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
