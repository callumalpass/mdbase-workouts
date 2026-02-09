import { Hono } from "hono";
import "../lib/context.js";
import { dateKeyInTimeZone, resolveTimeZone } from "../lib/timezone.js";
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

const plans = new Hono();
const ALLOWED_STATUSES = new Set(["scheduled", "completed", "skipped"]);

// List plans
plans.get("/", async (c) => {
  const db = c.get("db");
  const status = c.req.query("status");
  let where: string | undefined;
  if (status) {
    if (!ALLOWED_STATUSES.has(status)) {
      return c.json({ error: "Invalid status value" }, 400);
    }
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
  try {
    const body = expectRecord(await c.req.json(), "Plan payload must be an object");
    const timeZone = resolveTimeZone(asOptionalString(body.timezone) || c.req.query("timezone"));
    const date = asOptionalString(body.date) || dateKeyInTimeZone(new Date(), timeZone) || "1970-01-01";
    const title = asRequiredString(body.title, "title");
    const titleSlug = slugify(title) || "workout";
    const slug = `${date}-${titleSlug}`;
    const path = `plans/${slug}.md`;

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
      const targetReps = asOptionalInteger(ex.target_reps, `exercises[${index}].target_reps`);
      const targetWeight = asOptionalNumber(ex.target_weight, `exercises[${index}].target_weight`);
      const notes = asOptionalString(ex.notes);
      return {
        exercise: `[[exercises/${exerciseSlug}]]`,
        ...(targetSets != null && { target_sets: targetSets }),
        ...(targetReps != null && { target_reps: targetReps }),
        ...(targetWeight != null && { target_weight: targetWeight }),
        ...(notes && { notes }),
      };
    });

    const frontmatter: Record<string, unknown> = {
      date,
      title,
      exercises,
      status: "scheduled",
    };
    const notes = asOptionalString(body.notes);
    if (notes) frontmatter.notes = notes;

    const result = await db.create({
      path,
      type: "plan",
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

// Update plan
plans.put("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  try {
    const body = expectRecord(await c.req.json(), "Plan update payload must be an object");
    const result = await db.update({
      path: `plans/${id}.md`,
      fields: body,
    });
    if (result.error) return c.json({ error: result.error.message }, 400);
    return c.json({ path: `plans/${id}.md`, ...result.frontmatter });
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
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
