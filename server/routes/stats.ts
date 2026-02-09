import { Hono } from "hono";
import "../lib/context.js";
import { dateKeyInTimeZone, resolveTimeZone } from "../lib/timezone.js";

const stats = new Hono();

stats.get("/", async (c) => {
  const db = c.get("db");
  const now = new Date();
  const timeZone = resolveTimeZone(c.req.query("timezone"));
  const todayStr = dateKeyInTimeZone(now, timeZone) || "1970-01-01";
  const todayEpochDay = dateKeyToEpochDay(todayStr);

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

  const sessions = (sessionsResult.results || [])
    .map((r) => {
      const date = (r.frontmatter as any).date;
      const dateKey = dateKeyInTimeZone(date, timeZone);
      if (!dateKey) return null;
      return {
        path: r.path,
        ...r.frontmatter,
        __dateKey: dateKey,
      };
    })
    .filter(Boolean) as any[];

  const exerciseMap = new Map<string, any>();
  for (const r of exercisesResult.results || []) {
    const ex = { path: r.path, ...r.frontmatter } as any;
    exerciseMap.set(r.path, ex);
  }

  // --- Streak ---
  const sessionDates = new Set<string>();
  for (const s of sessions) {
    if (s.__dateKey) sessionDates.add(s.__dateKey);
  }

  // Walk backwards counting consecutive weeks with >= 1 session
  const monday = getMondayDateKey(todayStr);
  let weekStreak = 0;
  let weekStart = monday;

  // Check current week first
  if (hasSessionInWeek(sessionDates, weekStart)) {
    weekStreak = 1;
    weekStart = addDaysToDateKey(weekStart, -7);
    while (hasSessionInWeek(sessionDates, weekStart)) {
      weekStreak++;
      weekStart = addDaysToDateKey(weekStart, -7);
    }
  }

  // This week session count
  const thisMondayEpochDay = dateKeyToEpochDay(monday);
  let thisWeekSessions = 0;
  for (const dateStr of sessionDates) {
    const epochDay = dateKeyToEpochDay(dateStr);
    if (epochDay >= thisMondayEpochDay && epochDay <= todayEpochDay) thisWeekSessions++;
  }

  // --- PRs (today's sessions vs historical) ---
  const todaySessions = sessions.filter((s) => s.__dateKey === todayStr);
  const historicalSessions = sessions.filter((s) => s.__dateKey !== todayStr);
  const prs = computePRs(todaySessions, historicalSessions, exerciseMap);

  // --- Volume ---
  const sevenDaysAgoEpochDay = todayEpochDay - 6;
  const fourteenDaysAgoEpochDay = todayEpochDay - 13;
  const lastWeekEndEpochDay = todayEpochDay - 7;

  const thisWeekSess = sessions.filter((s) => {
    const epochDay = dateKeyToEpochDay(s.__dateKey);
    return epochDay >= sevenDaysAgoEpochDay && epochDay <= todayEpochDay;
  });
  const lastWeekSess = sessions.filter((s) => {
    const epochDay = dateKeyToEpochDay(s.__dateKey);
    return epochDay >= fourteenDaysAgoEpochDay && epochDay <= lastWeekEndEpochDay;
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

function getMondayDateKey(dateKey: string): string {
  const day = dateKeyWeekday(dateKey);
  const diff = day === 0 ? 6 : day - 1;
  return addDaysToDateKey(dateKey, -diff);
}

function hasSessionInWeek(dates: Set<string>, weekStart: string): boolean {
  for (let i = 0; i < 7; i++) {
    const key = addDaysToDateKey(weekStart, i);
    if (dates.has(key)) return true;
  }
  return false;
}

function dateKeyToEpochDay(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function epochDayToDateKey(epochDay: number): string {
  const d = new Date(epochDay * 86_400_000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  return epochDayToDateKey(dateKeyToEpochDay(dateKey) + days);
}

function dateKeyWeekday(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
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
