import { Hono } from "hono";
import "../lib/context.js";
import {
  ValidationError,
  asOptionalInteger,
  asOptionalString,
  asRequiredString,
  expectRecord,
  parsePositiveIntQuery,
  asSlug,
} from "../lib/validation.js";

const sessions = new Hono();

// List sessions (most recent first)
sessions.get("/", async (c) => {
  const db = c.get("db");
  const limit = parsePositiveIntQuery(c.req.query("limit"), 20, 100);
  const offset = parsePositiveIntQuery(c.req.query("offset"), 0, 10_000);
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
  try {
    const body = expectRecord(await c.req.json(), "Session payload must be an object");
    const now = new Date();
    const ts = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 17);
    const path = `sessions/${ts}.md`;

    const exercisesRaw = Array.isArray(body.exercises) ? body.exercises : [];
    const exercises = exercisesRaw.map((item, index) => {
      const ex = expectRecord(item, `exercises[${index}] must be an object`);
      const exercise = asSlug(asRequiredString(ex.exercise, `exercises[${index}].exercise`), `exercises[${index}].exercise`);
      const sets = Array.isArray(ex.sets) ? ex.sets : [];
      return {
        exercise: `[[exercises/${exercise}]]`,
        sets,
      };
    });

    const frontmatter: Record<string, unknown> = {
      date: asOptionalString(body.date) || now.toISOString(),
      exercises,
    };
    const durationMinutes = asOptionalInteger(body.duration_minutes, "duration_minutes");
    if (durationMinutes != null) frontmatter.duration_minutes = durationMinutes;

    const rating = asOptionalInteger(body.rating, "rating");
    if (rating != null) {
      if (rating < 1 || rating > 5) return c.json({ error: "rating must be between 1 and 5" }, 400);
      frontmatter.rating = rating;
    }

    const notes = asOptionalString(body.notes);
    if (notes) frontmatter.notes = notes;

    const plan = asOptionalString(body.plan);
    if (plan) {
      frontmatter.plan = `[[plans/${asSlug(plan, "plan")}]]`;
    }

    const result = await db.create({
      path,
      type: "session",
      frontmatter,
    });
    if (result.error) return c.json({ error: result.error.message }, 400);

    // If linked to a plan, update the plan status
    if (plan) {
      await db.update({
        path: `plans/${plan}.md`,
        fields: {
          status: "completed",
          session: `[[sessions/${ts}]]`,
        },
      });
    }

    return c.json({ path: result.path, ...result.frontmatter }, 201);
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

// Update session
sessions.put("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.get("db");
  try {
    const body = expectRecord(await c.req.json(), "Session update payload must be an object");
    const result = await db.update({
      path: `sessions/${id}.md`,
      fields: body,
    });
    if (result.error) return c.json({ error: result.error.message }, 400);
    return c.json({ path: `sessions/${id}.md`, ...result.frontmatter });
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
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
