import { Hono } from "hono";
import "../lib/context.js";

const quickLogs = new Hono();

// List quick logs (most recent first)
quickLogs.get("/", async (c) => {
  const db = c.get("db");
  const limit = Number(c.req.query("limit")) || 50;
  const result = await db.query({
    types: ["quick-log"],
    order_by: [{ field: "logged_at", direction: "desc" }],
    limit,
    include_body: false,
  });
  if (result.error) return c.json({ error: result.error.message }, 500);
  return c.json(
    result.results.map((r) => ({
      path: r.path,
      ...r.frontmatter,
    }))
  );
});

// Create quick log
quickLogs.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json();
  const now = new Date();
  const ts = now.toISOString().replace(/[-:]/g, "").slice(0, 15);
  const path = `quick-logs/${ts}.md`;

  const frontmatter: Record<string, unknown> = {
    exercise: `[[exercises/${body.exercise}]]`,
    logged_at: now.toISOString(),
  };
  if (body.reps != null) frontmatter.reps = body.reps;
  if (body.weight != null) frontmatter.weight = body.weight;
  if (body.duration_seconds != null) frontmatter.duration_seconds = body.duration_seconds;
  if (body.distance != null) frontmatter.distance = body.distance;
  if (body.notes) frontmatter.notes = body.notes;

  const result = await db.create({
    path,
    type: "quick-log",
    frontmatter,
  });
  if (result.error) return c.json({ error: result.error.message }, 400);
  return c.json({ path: result.path, ...result.frontmatter }, 201);
});

export default quickLogs;
