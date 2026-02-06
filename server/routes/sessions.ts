import { Hono } from "hono";
import "../lib/context.js";

const sessions = new Hono();

// List sessions (most recent first)
sessions.get("/", async (c) => {
  const db = c.get("db");
  const limit = Number(c.req.query("limit")) || 20;
  const offset = Number(c.req.query("offset")) || 0;
  const result = await db.query({
    types: ["session"],
    order_by: [{ field: "date", direction: "desc" }],
    limit,
    offset,
    include_body: false,
  });
  if (result.error) return c.json({ error: result.error.message }, 500);
  return c.json({
    sessions: result.results.map((r) => ({
      path: r.path,
      ...r.frontmatter,
    })),
    total: result.meta?.total_count ?? result.results.length,
    hasMore: result.meta?.has_more ?? false,
  });
});

// Get single session
sessions.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const result = await db.read(`sessions/${id}.md`);
  if (result.error) return c.json({ error: result.error.message }, 404);
  return c.json({ path: result.file?.path, ...result.frontmatter });
});

// Create session (optionally linked to a plan)
sessions.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json();
  const now = new Date();
  const ts = now.toISOString().replace(/[-:]/g, "").slice(0, 15);
  const path = `sessions/${ts}.md`;

  const frontmatter: Record<string, unknown> = {
    date: body.date || now.toISOString(),
    exercises: (body.exercises || []).map((ex: any) => ({
      exercise: `[[exercises/${ex.exercise}]]`,
      sets: ex.sets || [],
    })),
  };
  if (body.duration_minutes != null) frontmatter.duration_minutes = body.duration_minutes;
  if (body.rating != null) frontmatter.rating = body.rating;
  if (body.notes) frontmatter.notes = body.notes;
  if (body.plan) {
    frontmatter.plan = `[[plans/${body.plan}]]`;
  }

  const result = await db.create({
    path,
    type: "session",
    frontmatter,
  });
  if (result.error) return c.json({ error: result.error.message }, 400);

  // If linked to a plan, update the plan status
  if (body.plan) {
    await db.update({
      path: `plans/${body.plan}.md`,
      fields: {
        status: "completed",
        session: `[[sessions/${ts}]]`,
      },
    });
  }

  return c.json({ path: result.path, ...result.frontmatter }, 201);
});

// Update session
sessions.put("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const body = await c.req.json();
  const result = await db.update({
    path: `sessions/${id}.md`,
    fields: body,
  });
  if (result.error) return c.json({ error: result.error.message }, 400);
  return c.json({ path: `sessions/${id}.md`, ...result.frontmatter });
});

// Delete session
sessions.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const result = await db.delete(`sessions/${id}.md`);
  if (result.error) return c.json({ error: result.error.message }, 400);
  return c.json({ ok: true });
});

export default sessions;
