import { Hono } from "hono";
import "../lib/context.js";
import {
  ValidationError,
  asOptionalNumber,
  asOptionalString,
  asRequiredString,
  asSlug,
  expectRecord,
  parsePositiveIntQuery,
} from "../lib/validation.js";

const quickLogs = new Hono();

// List quick logs (most recent first)
quickLogs.get("/", async (c) => {
  const db = c.get("db");
  const limit = parsePositiveIntQuery(c.req.query("limit"), 50, 200);
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
  try {
    const body = expectRecord(await c.req.json(), "Quick log payload must be an object");
    const now = new Date();
    const ts = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 17);
    const path = `quick-logs/${ts}.md`;
    const exercise = asSlug(asRequiredString(body.exercise, "exercise"), "exercise");

    const frontmatter: Record<string, unknown> = {
      exercise: `[[exercises/${exercise}]]`,
      logged_at: asOptionalString(body.logged_at) || now.toISOString(),
    };

    const reps = asOptionalNumber(body.reps, "reps");
    const weight = asOptionalNumber(body.weight, "weight");
    const durationSeconds = asOptionalNumber(body.duration_seconds, "duration_seconds");
    const distance = asOptionalNumber(body.distance, "distance");
    const notes = asOptionalString(body.notes);

    if (reps != null) frontmatter.reps = reps;
    if (weight != null) frontmatter.weight = weight;
    if (durationSeconds != null) frontmatter.duration_seconds = durationSeconds;
    if (distance != null) frontmatter.distance = distance;
    if (notes) frontmatter.notes = notes;

    const result = await db.create({
      path,
      type: "quick-log",
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

export default quickLogs;
