import { Hono } from "hono";
import "../lib/context.js";

const stats = new Hono();

stats.get("/", async (c) => {
  const db = c.get("db");
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Fetch all sessions and exercises in parallel
  const [sessionsResult, exercisesResult] = await Promise.all([
    db.query({
      types: ["session"],
      order_by: [{ field: "date", direction: "desc" }],
      include_body: false,
    }),
    db.query({
      types: ["exercise"],
      include_body: false,
    }),
  ]);

  const sessions = (sessionsResult.results || []).map((r) => ({
    path: r.path,
    ...r.frontmatter,
  })) as any[];

  const exerciseMap = new Map<string, any>();
  for (const r of exercisesResult.results || []) {
    const ex = { path: r.path, ...r.frontmatter } as any;
    exerciseMap.set(r.path, ex);
  }

  // --- Streak ---
  const sessionDates = new Set<string>();
  for (const s of sessions) {
    if (s.date) sessionDates.add(s.date.slice(0, 10));
  }

  // Walk backwards counting consecutive weeks with >= 1 session
  const monday = getMonday(now);
  let weekStreak = 0;
  let weekStart = new Date(monday);

  // Check current week first
  if (hasSessionInWeek(sessionDates, weekStart)) {
    weekStreak = 1;
    weekStart.setDate(weekStart.getDate() - 7);
    while (hasSessionInWeek(sessionDates, weekStart)) {
      weekStreak++;
      weekStart.setDate(weekStart.getDate() - 7);
    }
  }

  // This week session count
  const thisMonday = getMonday(now);
  let thisWeekSessions = 0;
  for (const dateStr of sessionDates) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (d >= thisMonday && d <= now) thisWeekSessions++;
  }

  // --- PRs (today's sessions vs historical) ---
  const todaySessions = sessions.filter((s) => s.date?.startsWith(todayStr));
  const historicalSessions = sessions.filter((s) => !s.date?.startsWith(todayStr));
  const prs = computePRs(todaySessions, historicalSessions, exerciseMap);

  // --- Volume ---
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const thisWeekSess = sessions.filter((s) => {
    const d = new Date(s.date);
    return d >= sevenDaysAgo && d <= now;
  });
  const lastWeekSess = sessions.filter((s) => {
    const d = new Date(s.date);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  });

  const thisWeekVolume = computeVolume(thisWeekSess, exerciseMap);
  const lastWeekVolume = computeVolume(lastWeekSess, exerciseMap);

  return c.json({
    streak: { weekStreak, thisWeekSessions },
    prs,
    volume: {
      thisWeek: { sets: thisWeekVolume.sets, volume: thisWeekVolume.volume },
      lastWeek: { sets: lastWeekVolume.sets, volume: lastWeekVolume.volume },
      muscleGroups: thisWeekVolume.muscleGroups,
    },
  });
});

function getMonday(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date;
}

function hasSessionInWeek(dates: Set<string>, weekStart: Date): boolean {
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    if (dates.has(key)) return true;
  }
  return false;
}

function computePRs(
  todaySessions: any[],
  historicalSessions: any[],
  exerciseMap: Map<string, any>
): any[] {
  // Build historical bests per exercise
  const histBestWeight = new Map<string, number>();
  const histBestE1rm = new Map<string, number>();

  for (const session of historicalSessions) {
    for (const ex of session.exercises || []) {
      const slug = ex.exercise; // wikilink like [[exercises/bench-press]]
      for (const set of ex.sets || []) {
        const w = set.weight ?? 0;
        const r = set.reps ?? 0;
        if (w > 0) {
          histBestWeight.set(slug, Math.max(histBestWeight.get(slug) || 0, w));
          const e1rm = w * (1 + r / 30);
          histBestE1rm.set(slug, Math.max(histBestE1rm.get(slug) || 0, e1rm));
        }
      }
    }
  }

  const prs: any[] = [];
  const seenPRs = new Set<string>();

  for (const session of todaySessions) {
    for (const ex of session.exercises || []) {
      const slug = ex.exercise;
      // Resolve exercise name from wikilink
      const match = slug.match(/\[\[(.+?)\]\]/);
      const exPath = match ? `${match[1]}.md` : null;
      const exerciseData = exPath ? exerciseMap.get(exPath) : null;
      const exerciseName = exerciseData?.name || (match ? match[1].split("/").pop() : slug);

      for (const set of ex.sets || []) {
        const w = set.weight ?? 0;
        const r = set.reps ?? 0;
        if (w <= 0) continue;

        // Check max weight PR
        const prevBestW = histBestWeight.get(slug) || 0;
        if (w > prevBestW) {
          const key = `${slug}-weight`;
          if (!seenPRs.has(key)) {
            seenPRs.add(key);
            prs.push({
              exercise: exerciseName,
              type: "weight",
              value: w,
              reps: r,
              date: session.date,
            });
          }
        }

        // Check e1RM PR
        const e1rm = w * (1 + r / 30);
        const prevBestE1rm = histBestE1rm.get(slug) || 0;
        if (e1rm > prevBestE1rm) {
          const key = `${slug}-e1rm`;
          if (!seenPRs.has(key)) {
            seenPRs.add(key);
            prs.push({
              exercise: exerciseName,
              type: "e1rm",
              value: Math.round(e1rm * 10) / 10,
              reps: r,
              date: session.date,
            });
          }
        }
      }
    }
  }

  return prs;
}

function computeVolume(
  sessions: any[],
  exerciseMap: Map<string, any>
): { sets: number; volume: number; muscleGroups: Record<string, number> } {
  let totalSets = 0;
  let totalVolume = 0;
  const muscleGroups: Record<string, number> = {};

  for (const session of sessions) {
    for (const ex of session.exercises || []) {
      const sets = ex.sets || [];
      totalSets += sets.length;

      for (const set of sets) {
        const w = set.weight ?? 0;
        const r = set.reps ?? 0;
        totalVolume += w * r;
      }

      // Resolve exercise for muscle group
      const match = (ex.exercise as string).match(/\[\[(.+?)\]\]/);
      const exPath = match ? `${match[1]}.md` : null;
      const exerciseData = exPath ? exerciseMap.get(exPath) : null;
      if (exerciseData?.muscle_groups) {
        for (const mg of exerciseData.muscle_groups) {
          muscleGroups[mg] = (muscleGroups[mg] || 0) + sets.length;
        }
      }
    }
  }

  return { sets: totalSets, volume: Math.round(totalVolume), muscleGroups };
}

export default stats;
