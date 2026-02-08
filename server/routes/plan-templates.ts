import { Hono } from "hono";
import "../lib/context.js";

const planTemplates = new Hono();

// List templates
planTemplates.get("/", async (c) => {
  const db = c.get("db");
  const result = await db.query({
    types: ["plan-template"],
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

// Get single template
planTemplates.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const result = await db.read(`plan-templates/${id}.md`);
  if (result.error) return c.json({ error: result.error.message }, 404);
  return c.json({ path: result.file?.path, ...result.frontmatter });
});

// Create template
planTemplates.post("/", async (c) => {
  const db = c.get("db");
  const body = await c.req.json();
  const slug = (body.title || "template")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const path = `plan-templates/${slug}.md`;

  const frontmatter: Record<string, unknown> = {
    title: body.title,
    exercises: (body.exercises || []).map((ex: any) => ({
      exercise: `[[exercises/${ex.exercise}]]`,
      ...(ex.target_sets != null && { target_sets: ex.target_sets }),
      ...(ex.target_reps != null && { target_reps: String(ex.target_reps) }),
      ...(ex.target_weight != null && { target_weight: ex.target_weight }),
      ...(ex.notes && { notes: ex.notes }),
    })),
  };
  if (body.notes) frontmatter.notes = body.notes;

  const result = await db.create({
    path,
    type: "plan-template",
    frontmatter,
  });
  if (result.error) return c.json({ error: result.error.message }, 400);
  return c.json({ path: result.path, ...result.frontmatter }, 201);
});

// Update template
planTemplates.put("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const body = await c.req.json();
  const result = await db.update({
    path: `plan-templates/${id}.md`,
    fields: body,
  });
  if (result.error) return c.json({ error: result.error.message }, 400);
  return c.json({ path: `plan-templates/${id}.md`, ...result.frontmatter });
});

// Delete template
planTemplates.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  const result = await db.delete(`plan-templates/${id}.md`);
  if (result.error) return c.json({ error: result.error.message }, 400);
  return c.json({ ok: true });
});

export default planTemplates;
