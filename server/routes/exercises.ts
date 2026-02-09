import { Hono } from "hono";
import "../lib/context.js";
import {
  ValidationError,
  asOptionalString,
  asRequiredString,
  asSlug,
  expectRecord,
  slugify,
} from "../lib/validation.js";

const exercises = new Hono();

// List all exercises
exercises.get("/", async (c) => {
  const db = c.get("db");
  const result = await db.query({
    types: ["exercise"],
    order_by: [{ field: "name", direction: "asc" }],
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

// Batch fetch last session sets for multiple exercises
exercises.post("/last-sets", async (c) => {
  try {
    const payload = expectRecord(await c.req.json(), "Payload must be an object");
    const slugsRaw = Array.isArray(payload.slugs) ? payload.slugs : [];
    const slugs = slugsRaw
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => asSlug(s, "slugs[]"));
    if (slugs.length === 0) return c.json({});

    const db = c.get("db");
    const sessionsResult = await db.query({
      types: ["session"],
      order_by: [{ field: "date", direction: "desc" }],
      include_body: false,
    });
    if (sessionsResult.error) return c.json({ error: sessionsResult.error.message }, 500);

    const wikilinks = new Map(slugs.map((s) => [`[[exercises/${s}]]`, s]));
    const remaining = new Set(slugs);
    const result: Record<string, { date: string; sets: unknown[] }> = {};

    for (const r of sessionsResult.results) {
      if (remaining.size === 0) break;
      const session = r.frontmatter as any;
      for (const ex of session.exercises || []) {
        const slug = wikilinks.get(ex.exercise);
        if (slug && remaining.has(slug)) {
          result[slug] = { date: session.date, sets: ex.sets || [] };
          remaining.delete(slug);
        }
      }
    }

    return c.json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

// Get exercise history with stats
exercises.get("/:slug/history", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");

  // Fetch exercise, all sessions, and all quick-logs in parallel
  const [exerciseResult, sessionsResult, quickLogsResult] = await Promise.all([
    db.read(`exercises/${slug}.md`),
    db.query({
      types: ["session"],
      order_by: [{ field: "date", direction: "desc" }],
      include_body: false,
    }),
    db.query({
      types: ["quick-log"],
      order_by: [{ field: "logged_at", direction: "desc" }],
      include_body: false,
    }),
  ]);

  if (exerciseResult.error)
    return c.json({ error: exerciseResult.error.message }, 404);

  const exercise = { path: exerciseResult.file?.path, ...exerciseResult.frontmatter };
  const wikilink = `[[exercises/${slug}]]`;

  // Filter sessions that reference this exercise
  const entries: any[] = [];
  for (const r of sessionsResult.results || []) {
    const session = { path: r.path, ...r.frontmatter } as any;
    const matchingExercises = (session.exercises || []).filter(
      (ex: any) => ex.exercise === wikilink
    );
    if (matchingExercises.length > 0) {
      for (const ex of matchingExercises) {
        entries.push({
          source: "session" as const,
          date: session.date,
          sets: ex.sets || [],
          sessionPath: session.path,
        });
      }
    }
  }

  // Filter quick-logs that reference this exercise
  for (const r of quickLogsResult.results || []) {
    const log = { path: r.path, ...r.frontmatter } as any;
    if (log.exercise === wikilink) {
      const set: any = {};
      if (log.reps != null) set.reps = log.reps;
      if (log.weight != null) set.weight = log.weight;
      if (log.duration_seconds != null) set.duration_seconds = log.duration_seconds;
      if (log.distance != null) set.distance = log.distance;
      entries.push({
        source: "quick-log" as const,
        date: log.logged_at,
        sets: [set],
      });
    }
  }

  // Sort entries by date descending
  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Compute stats based on tracking type
  const stats = computeStats((exercise as any).tracking, entries);

  return c.json({ exercise, stats, entries });
});

function computeStats(tracking: string, entries: any[]) {
  const stats: any = {
    totalEntries: entries.length,
    firstLogged: entries.length > 0 ? entries[entries.length - 1].date : null,
    lastLogged: entries.length > 0 ? entries[0].date : null,
  };

  const allSets = entries.flatMap((e) => e.sets || []);

  if (tracking === "weight_reps") {
    let prWeight = 0;
    let prSetStr = "";
    let totalVolume = 0;
    const sessionEntries = entries.filter((e) => e.source === "session");

    for (const set of allSets) {
      const w = set.weight ?? 0;
      const r = set.reps ?? 0;
      if (w > prWeight) {
        prWeight = w;
        prSetStr = `${w}kg × ${r}`;
      }
      totalVolume += w * r;
    }

    stats.prWeight = prWeight;
    stats.prSet = prSetStr;
    stats.totalVolume = totalVolume;
    stats.avgSetsPerSession =
      sessionEntries.length > 0
        ? +(sessionEntries.reduce((sum, e) => sum + (e.sets?.length || 0), 0) / sessionEntries.length).toFixed(1)
        : 0;
  } else if (tracking === "reps_only") {
    let maxReps = 0;
    let totalReps = 0;
    for (const set of allSets) {
      const r = set.reps ?? 0;
      if (r > maxReps) maxReps = r;
      totalReps += r;
    }
    stats.maxReps = maxReps;
    stats.totalReps = totalReps;
  } else if (tracking === "timed") {
    let longestDuration = 0;
    let totalDuration = 0;
    for (const set of allSets) {
      const d = set.duration_seconds ?? 0;
      if (d > longestDuration) longestDuration = d;
      totalDuration += d;
    }
    stats.longestDuration = longestDuration;
    stats.totalDuration = totalDuration;
  } else if (tracking === "distance") {
    let longestDistance = 0;
    let totalDistance = 0;
    for (const set of allSets) {
      const d = set.distance ?? 0;
      if (d > longestDistance) longestDistance = d;
      totalDistance += d;
    }
    stats.longestDistance = longestDistance;
    stats.totalDistance = totalDistance;
  }

  return stats;
}

// Get single exercise
exercises.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const result = await db.read(`exercises/${slug}.md`);
  if (result.error) return c.json({ error: result.error.message }, 404);
  return c.json({ path: result.file?.path, ...result.frontmatter });
});

// Create exercise
exercises.post("/", async (c) => {
  const db = c.get("db");
  try {
    const body = expectRecord(await c.req.json(), "Exercise payload must be an object");
    const name = asRequiredString(body.name, "name");
    const slug = slugify(name) || "exercise";
    const result = await db.create({
      path: `exercises/${slug}.md`,
      type: "exercise",
      frontmatter: {
        ...body,
        name,
      },
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

// Update exercise
exercises.put("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  try {
    const body = expectRecord(await c.req.json(), "Exercise update payload must be an object");
    const name = asOptionalString(body.name);
    const result = await db.update({
      path: `exercises/${slug}.md`,
      fields: {
        ...body,
        ...(name ? { name } : {}),
      },
    });
    if (result.error) return c.json({ error: result.error.message }, 400);
    return c.json({ path: `exercises/${slug}.md`, ...result.frontmatter });
  } catch (err) {
    if (err instanceof ValidationError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

// Delete exercise
exercises.delete("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = c.get("db");
  const result = await db.delete(`exercises/${slug}.md`);
  if (result.error) return c.json({ error: result.error.message }, 400);
  return c.json({ ok: true });
});

export default exercises;
