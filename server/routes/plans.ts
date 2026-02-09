import { Hono } from "hono";
import "../lib/context.js";
import { dateKeyInTimeZone, resolveTimeZone } from "../lib/timezone.js";

const plans = new Hono();

// List plans
plans.get("/", async (c) => {
  const db = c.get("db");
  const status = c.req.query("status");
  let where: string | undefined;
  if (status) {
    where = `status == "${status}"`;
  }
  const result = await db.query({
    types: ["plan"],
    where,
    order_by: [{ field: "date", direction: "desc" }],
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

// Get single plan
plans.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const result = await db.read(`plans/${id}.md`);
  if (result.error) return c.json({ error: result.error.message }, 404);
  return c.json({ path: result.file?.path, ...result.frontmatter });
});

// Create plan
plans.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json();
  const timeZone = resolveTimeZone(body.timezone || c.req.query("timezone"));
  const date = body.date || dateKeyInTimeZone(new Date(), timeZone) || "1970-01-01";
  const slug = `${date}-${(body.title || "workout")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")}`;
  const path = `plans/${slug}.md`;

  const frontmatter: Record<string, unknown> = {
    date,
    title: body.title,
    exercises: (body.exercises || []).map((ex: any) => ({
      exercise: `[[exercises/${ex.exercise}]]`,
      ...(ex.target_sets != null && { target_sets: ex.target_sets }),
      ...(ex.target_reps != null && { target_reps: ex.target_reps }),
      ...(ex.target_weight != null && { target_weight: ex.target_weight }),
      ...(ex.notes && { notes: ex.notes }),
    })),
    status: "scheduled",
  };
  if (body.notes) frontmatter.notes = body.notes;

  const result = await db.create({
    path,
    type: "plan",
    frontmatter,
  });
  if (result.error) return c.json({ error: result.error.message }, 400);
  return c.json({ path: result.path, ...result.frontmatter }, 201);
});

// Update plan
plans.put("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const body = await c.req.json();
  const result = await db.update({
    path: `plans/${id}.md`,
    fields: body,
  });
  if (result.error) return c.json({ error: result.error.message }, 400);
  return c.json({ path: `plans/${id}.md`, ...result.frontmatter });
});

// Delete plan
plans.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const result = await db.delete(`plans/${id}.md`);
  if (result.error) return c.json({ error: result.error.message }, 400);
  return c.json({ ok: true });
});

export default plans;
