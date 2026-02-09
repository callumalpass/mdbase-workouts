import { Hono } from "hono";
import "../lib/context.js";
import {
  ValidationError,
  asOptionalInteger,
  asOptionalNumber,
  asOptionalString,
  asRequiredString,
  asSlug,
  expectRecord,
  slugify,
} from "../lib/validation.js";

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
  try {
    const body = expectRecord(await c.req.json(), "Plan template payload must be an object");
    const title = asRequiredString(body.title, "title");
    const slug = slugify(title) || "template";
    const path = `plan-templates/${slug}.md`;
    const exercisesRaw = Array.isArray(body.exercises) ? body.exercises : [];
    if (exercisesRaw.length === 0) {
      return c.json({ error: "exercises must contain at least one exercise" }, 400);
    }

    const exercises = exercisesRaw.map((item, index) => {
      const ex = expectRecord(item, `exercises[${index}] must be an object`);
      const exerciseSlug = asSlug(
        asRequiredString(ex.exercise, `exercises[${index}].exercise`),
        `exercises[${index}].exercise`
      );
      const targetSets = asOptionalInteger(ex.target_sets, `exercises[${index}].target_sets`);
      const targetReps = asOptionalString(ex.target_reps);
      const targetWeight = asOptionalNumber(ex.target_weight, `exercises[${index}].target_weight`);
      const notes = asOptionalString(ex.notes);
      return {
        exercise: `[[exercises/${exerciseSlug}]]`,
        ...(targetSets != null && { target_sets: targetSets }),
        ...(targetReps && { target_reps: targetReps }),
        ...(targetWeight != null && { target_weight: targetWeight }),
        ...(notes && { notes }),
      };
    });

    const frontmatter: Record<string, unknown> = { title, exercises };
    const notes = asOptionalString(body.notes);
    if (notes) frontmatter.notes = notes;

    const result = await db.create({
      path,
      type: "plan-template",
      frontmatter,
    });
    if (result.error) return c.json({ error: result.error.message }, 400);
    return c.json({ path: result.path, ...result.frontmatter }, 201);
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

// Update template
planTemplates.put("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  try {
    const body = expectRecord(await c.req.json(), "Plan template update payload must be an object");
    const result = await db.update({
      path: `plan-templates/${id}.md`,
      fields: body,
    });
    if (result.error) return c.json({ error: result.error.message }, 400);
    return c.json({ path: `plan-templates/${id}.md`, ...result.frontmatter });
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
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
