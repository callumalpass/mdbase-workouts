import { Hono } from "hono";
import "../lib/context.js";
import { dateKeyInTimeZone, resolveTimeZone } from "../lib/timezone.js";
import { parsePositiveIntQuery } from "../lib/validation.js";

const stats = new Hono();

stats.get("/", async (c) => {
  const db = c.get("db");
  const now = new Date();
  const timeZone = resolveTimeZone(c.req.query("timezone"));
  const sessionLimit = parsePositiveIntQuery(c.req.query("limit"), 5000, 20000);
  const todayStr = dateKeyInTimeZone(now, timeZone) || "1970-01-01";
  const todayEpochDay = dateKeyToEpochDay(todayStr);

  // Fetch all sessions, exercises, and quick-logs in parallel
  const [sessionsResult, exercisesResult, quickLogsResult] = await Promise.all([
    db.query({
      types: ["session"],
      order_by: [{ field: "date", direction: "desc" }],
      limit: sessionLimit,
      include_body: false,
    }),
    db.query({
      types: ["exercise"],
      include_body: false,
    }),
    db.query({
      types: ["quick-log"],
      include_body: false,
    }),
  ]);

  if (sessionsResult.error) return c.json({ error: sessionsResult.error.message }, 500);
  if (exercisesResult.error) return c.json({ error: exercisesResult.error.message }, 500);
  if (quickLogsResult.error) return c.json({ error: quickLogsResult.error.message }, 500);

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

  // --- Quick-log dates ---
  const quickLogDates = new Set<string>();
  for (const r of quickLogsResult.results || []) {
    const loggedAt = (r.frontmatter as any).logged_at;
    if (loggedAt) {
      const dateKey = dateKeyInTimeZone(loggedAt, timeZone);
      if (dateKey) quickLogDates.add(dateKey);
    }
  }

  // --- Streak (day-based with cheat days) ---
  const activeDates = new Set<string>();
  for (const s of sessions) {
    if (s.__dateKey) activeDates.add(s.__dateKey);
  }
  for (const d of quickLogDates) {
    activeDates.add(d);
  }

  const streakResult = computeStreak(activeDates, todayEpochDay);

  // This week session count (sessions only, Mon-today)
  const monday = getMondayDateKey(todayStr);
  const thisMondayEpochDay = dateKeyToEpochDay(monday);
  let thisWeekSessions = 0;
  for (const s of sessions) {
    const epochDay = dateKeyToEpochDay(s.__dateKey);
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
    streak: {
      currentStreak: streakResult.currentStreak,
      thisWeekSessions,
      bankedCheatDays: streakResult.bankedCheatDays,
      cheatDayDates: streakResult.cheatDayDates,
    },
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

interface StreakResult {
  currentStreak: number;
  bankedCheatDays: number;
  cheatDayDates: string[];
}

function computeStreak(activeDates: Set<string>, todayEpochDay: number): StreakResult {
  if (activeDates.size === 0) {
    return { currentStreak: 0, bankedCheatDays: 0, cheatDayDates: [] };
  }

  // Convert to sorted epoch days
  const epochDays = Array.from(activeDates)
    .map(dateKeyToEpochDay)
    .sort((a, b) => a - b);

  const earliest = epochDays[0];
  const activeSet = new Set(epochDays);

  let streak = 0;
  let activeInStreak = 0;
  let consecutiveRest = 0;
  let bank = 0;
  let cheatDayDates: string[] = [];

  for (let day = earliest; day <= todayEpochDay; day++) {
    if (activeSet.has(day)) {
      streak++;
      activeInStreak++;
      consecutiveRest = 0;
      if (activeInStreak % 7 === 0) {
        bank = Math.min(bank + 1, 5);
      }
    } else {
      consecutiveRest++;
      if (consecutiveRest >= 2) {
        if (bank > 0) {
          bank--;
          cheatDayDates.push(epochDayToDateKey(day));
          consecutiveRest = 0; // streak survives, not incremented
        } else {
          // Streak breaks
          streak = 0;
          activeInStreak = 0;
          bank = 0;
          cheatDayDates = [];
          consecutiveRest = 0;
        }
      }
    }
  }

  return { currentStreak: streak, bankedCheatDays: bank, cheatDayDates };
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

stats.get("/weekly", async (c) => {
  const db = c.get("db");
  const now = new Date();
  const timeZone = resolveTimeZone(c.req.query("timezone"));
  const todayStr = dateKeyInTimeZone(now, timeZone) || "1970-01-01";

  const [sessionsResult, quickLogsResult] = await Promise.all([
    db.query({ types: ["session"], limit: 20000, include_body: false }),
    db.query({ types: ["quick-log"], limit: 20000, include_body: false }),
  ]);

  if (sessionsResult.error) return c.json({ error: sessionsResult.error.message }, 500);
  if (quickLogsResult.error) return c.json({ error: quickLogsResult.error.message }, 500);

  const weekSets = new Map<string, number>();

  for (const r of sessionsResult.results || []) {
    const date = (r.frontmatter as any).date;
    const dateKey = dateKeyInTimeZone(date, timeZone);
    if (!dateKey) continue;
    const weekStart = getMondayDateKey(dateKey);
    let sets = 0;
    for (const ex of (r.frontmatter as any).exercises || []) {
      sets += (ex.sets || []).length;
    }
    weekSets.set(weekStart, (weekSets.get(weekStart) || 0) + sets);
  }

  for (const r of quickLogsResult.results || []) {
    const loggedAt = (r.frontmatter as any).logged_at;
    if (!loggedAt) continue;
    const dateKey = dateKeyInTimeZone(loggedAt, timeZone);
    if (!dateKey) continue;
    const weekStart = getMondayDateKey(dateKey);
    weekSets.set(weekStart, (weekSets.get(weekStart) || 0) + 1);
  }

  if (weekSets.size === 0) return c.json({ weeks: [] });

  const todayWeekStart = getMondayDateKey(todayStr);
  const allWeekStarts = Array.from(weekSets.keys()).sort();
  const earliestWeek = allWeekStarts[0];

  const weeks: Array<{ weekStart: string; sets: number; isCurrentWeek: boolean }> = [];
  let current = earliestWeek;
  const currentEpoch = dateKeyToEpochDay(todayWeekStart);

  while (dateKeyToEpochDay(current) <= currentEpoch) {
    weeks.push({
      weekStart: current,
      sets: weekSets.get(current) || 0,
      isCurrentWeek: current === todayWeekStart,
    });
    current = addDaysToDateKey(current, 7);
  }

  return c.json({ weeks });
});

export default stats;
