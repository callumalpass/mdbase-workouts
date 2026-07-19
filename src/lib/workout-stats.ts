import type {
  Exercise,
  PR,
  QuickLog,
  Session,
  StatsResponse,
  WeeklyStatsResponse,
} from "./types";

interface WorkoutStatsInput {
  sessions: Session[];
  exercises: Exercise[];
  quickLogs: QuickLog[];
  timeZone?: string;
  now?: Date;
}

interface DatedSession extends Session {
  dateKey: string;
}

interface StreakResult {
  currentStreak: number;
  longestRun: number;
  bankedCheatDays: number;
  cheatDayDates: string[];
  currentRunDates: string[];
  runDates: string[];
}

export function computeWorkoutStats({
  sessions,
  exercises,
  quickLogs,
  timeZone = "UTC",
  now = new Date(),
}: WorkoutStatsInput): StatsResponse {
  const zone = validTimeZone(timeZone) ? timeZone : "UTC";
  const today = dateKey(now, zone) || "1970-01-01";
  const todayEpochDay = dateKeyToEpochDay(today);
  const datedSessions = sessions
    .map((session) => ({ ...session, dateKey: dateKey(session.date, zone) }))
    .filter((session): session is DatedSession => Boolean(session.dateKey));
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.path, exercise]));
  const activeDates = new Set(datedSessions.map((session) => session.dateKey));
  for (const log of quickLogs) {
    const logged = dateKey(log.logged_at, zone);
    if (logged) activeDates.add(logged);
  }

  const streak = computeStreak(activeDates, todayEpochDay);
  const mondayEpochDay = dateKeyToEpochDay(getMondayDateKey(today));
  const thisWeekSessions = datedSessions.filter((session) => {
    const day = dateKeyToEpochDay(session.dateKey);
    return day >= mondayEpochDay && day <= todayEpochDay;
  }).length;
  const todaySessions = datedSessions.filter((session) => session.dateKey === today);
  const historicalSessions = datedSessions.filter((session) => session.dateKey !== today);
  const thisWeekVolume = computeVolume(
    sessionsInRange(datedSessions, todayEpochDay - 6, todayEpochDay),
    exerciseMap,
  );
  const lastWeekVolume = computeVolume(
    sessionsInRange(datedSessions, todayEpochDay - 13, todayEpochDay - 7),
    exerciseMap,
  );

  return {
    streak: {
      currentStreak: streak.currentStreak,
      longestRun: streak.longestRun,
      thisWeekSessions,
      bankedCheatDays: streak.bankedCheatDays,
      cheatDayDates: streak.cheatDayDates,
      currentRunDates: streak.currentRunDates,
      runDates: streak.runDates,
      runStatus: computeRunStatus(activeDates, today, todayEpochDay, streak),
    },
    prs: computePRs(todaySessions, historicalSessions, exerciseMap),
    volume: {
      thisWeek: { sets: thisWeekVolume.sets, volume: thisWeekVolume.volume },
      lastWeek: { sets: lastWeekVolume.sets, volume: lastWeekVolume.volume },
      muscleGroups: thisWeekVolume.muscleGroups,
    },
  };
}

export function computeWorkoutWeeklyStats({
  sessions,
  quickLogs,
  timeZone = "UTC",
  now = new Date(),
}: Omit<WorkoutStatsInput, "exercises">): WeeklyStatsResponse {
  const zone = validTimeZone(timeZone) ? timeZone : "UTC";
  const today = dateKey(now, zone) || "1970-01-01";
  const weekSets = new Map<string, number>();

  for (const session of sessions) {
    const sessionDate = dateKey(session.date, zone);
    if (!sessionDate) continue;
    const weekStart = getMondayDateKey(sessionDate);
    const sets = (session.exercises ?? []).reduce((total, exercise) => total + (exercise.sets?.length ?? 0), 0);
    weekSets.set(weekStart, (weekSets.get(weekStart) ?? 0) + sets);
  }
  for (const log of quickLogs) {
    const logged = dateKey(log.logged_at, zone);
    if (!logged) continue;
    const weekStart = getMondayDateKey(logged);
    weekSets.set(weekStart, (weekSets.get(weekStart) ?? 0) + 1);
  }
  if (weekSets.size === 0) return { weeks: [] };

  const currentWeek = getMondayDateKey(today);
  const currentEpochDay = dateKeyToEpochDay(currentWeek);
  const weeks: WeeklyStatsResponse["weeks"] = [];
  let cursor = [...weekSets.keys()].sort()[0];
  while (dateKeyToEpochDay(cursor) <= currentEpochDay) {
    weeks.push({
      weekStart: cursor,
      sets: weekSets.get(cursor) ?? 0,
      isCurrentWeek: cursor === currentWeek,
    });
    cursor = addDaysToDateKey(cursor, 7);
  }
  return { weeks };
}

function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function dateKey(value: string | Date, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getMondayDateKey(value: string): string {
  const weekday = dateKeyWeekday(value);
  return addDaysToDateKey(value, -(weekday === 0 ? 6 : weekday - 1));
}

function dateKeyToEpochDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function epochDayToDateKey(epochDay: number): string {
  const value = new Date(epochDay * 86_400_000);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function addDaysToDateKey(value: string, days: number): string {
  return epochDayToDateKey(dateKeyToEpochDay(value) + days);
}

function dateKeyWeekday(value: string): number {
  return new Date(dateKeyToEpochDay(value) * 86_400_000).getUTCDay();
}

function sessionsInRange(sessions: DatedSession[], first: number, last: number): DatedSession[] {
  return sessions.filter((session) => {
    const day = dateKeyToEpochDay(session.dateKey);
    return day >= first && day <= last;
  });
}

function computeStreak(activeDates: Set<string>, todayEpochDay: number): StreakResult {
  if (activeDates.size === 0) {
    return { currentStreak: 0, longestRun: 0, bankedCheatDays: 0, cheatDayDates: [], currentRunDates: [], runDates: [] };
  }
  const activeDays = [...activeDates].map(dateKeyToEpochDay).sort((a, b) => a - b);
  const activeSet = new Set(activeDays);
  let streak = 0;
  let longestRun = 0;
  let activeInStreak = 0;
  let consecutiveRest = 0;
  let bank = 0;
  let cheatDayDates: string[] = [];
  let currentRunDates: string[] = [];
  const runDates: string[] = [];

  for (let day = activeDays[0]; day <= todayEpochDay; day += 1) {
    const key = epochDayToDateKey(day);
    if (activeSet.has(day)) {
      streak += 1;
      longestRun = Math.max(longestRun, streak);
      activeInStreak += 1;
      consecutiveRest = 0;
      currentRunDates.push(key);
      if (activeInStreak % 7 === 0) bank = Math.min(bank + 1, 5);
      continue;
    }
    if (streak > 0) currentRunDates.push(key);
    consecutiveRest += 1;
    if (consecutiveRest < 2) continue;
    if (bank > 0) {
      bank -= 1;
      cheatDayDates.push(key);
      consecutiveRest = 0;
    } else {
      runDates.push(...currentRunDates.slice(0, -1));
      streak = 0;
      activeInStreak = 0;
      bank = 0;
      cheatDayDates = [];
      currentRunDates = [];
      consecutiveRest = 0;
    }
  }
  return {
    currentStreak: streak,
    longestRun,
    bankedCheatDays: bank,
    cheatDayDates,
    currentRunDates,
    runDates: [...runDates, ...currentRunDates],
  };
}

function computeRunStatus(
  activeDates: Set<string>,
  today: string,
  todayEpochDay: number,
  streak: StreakResult,
): StatsResponse["streak"]["runStatus"] {
  const todayActive = activeDates.has(today);
  const pastActiveDays = [...activeDates]
    .map(dateKeyToEpochDay)
    .filter((day) => day <= todayEpochDay)
    .sort((a, b) => b - a);
  const lastActiveDay = pastActiveDays[0] ?? null;
  const lastActiveDate = lastActiveDay == null ? null : epochDayToDateKey(lastActiveDay);
  const quietDays = todayActive || lastActiveDay == null ? 0 : todayEpochDay - lastActiveDay;
  if (todayActive) return { kind: "active", todayActive, quietDays, lastActiveDate, recoverableStreak: null };

  const yesterday = computeStreak(activeDates, todayEpochDay - 1);
  const activeWithToday = new Set(activeDates).add(today);
  const withToday = computeStreak(activeWithToday, todayEpochDay);
  if (streak.currentStreak === 0 && yesterday.currentStreak > 0 && withToday.currentStreak > 0) {
    return { kind: "hinge-day", todayActive, quietDays, lastActiveDate, recoverableStreak: withToday.currentStreak };
  }
  if (streak.currentStreak > 0) return { kind: "quiet-day", todayActive, quietDays, lastActiveDate, recoverableStreak: null };
  return { kind: "reset", todayActive, quietDays, lastActiveDate, recoverableStreak: null };
}

function computePRs(
  todaySessions: DatedSession[],
  historicalSessions: DatedSession[],
  exercises: Map<string, Exercise>,
): PR[] {
  const historicalWeight = new Map<string, number>();
  const historicalE1rm = new Map<string, number>();
  for (const session of historicalSessions) {
    for (const exercise of session.exercises ?? []) {
      for (const set of exercise.sets ?? []) {
        const weight = set.weight ?? 0;
        const reps = set.reps ?? 0;
        if (weight <= 0) continue;
        historicalWeight.set(exercise.exercise, Math.max(historicalWeight.get(exercise.exercise) ?? 0, weight));
        historicalE1rm.set(exercise.exercise, Math.max(historicalE1rm.get(exercise.exercise) ?? 0, weight * (1 + reps / 30)));
      }
    }
  }

  const prs: PR[] = [];
  const seen = new Set<string>();
  for (const session of todaySessions) {
    for (const exercise of session.exercises ?? []) {
      const link = exercise.exercise.match(/\[\[(.+?)\]\]/)?.[1];
      const exerciseName = (link ? exercises.get(`${link}.md`)?.name : undefined) ?? link?.split("/").pop() ?? exercise.exercise;
      for (const set of exercise.sets ?? []) {
        const weight = set.weight ?? 0;
        const reps = set.reps ?? 0;
        if (weight <= 0) continue;
        if (weight > (historicalWeight.get(exercise.exercise) ?? 0) && !seen.has(`${exercise.exercise}-weight`)) {
          seen.add(`${exercise.exercise}-weight`);
          prs.push({ exercise: exerciseName, type: "weight", value: weight, reps, date: session.date });
        }
        const e1rm = weight * (1 + reps / 30);
        if (e1rm > (historicalE1rm.get(exercise.exercise) ?? 0) && !seen.has(`${exercise.exercise}-e1rm`)) {
          seen.add(`${exercise.exercise}-e1rm`);
          prs.push({ exercise: exerciseName, type: "e1rm", value: Math.round(e1rm * 10) / 10, reps, date: session.date });
        }
      }
    }
  }
  return prs;
}

function computeVolume(sessions: DatedSession[], exercises: Map<string, Exercise>) {
  let sets = 0;
  let volume = 0;
  const muscleGroups: Record<string, number> = {};
  for (const session of sessions) {
    for (const sessionExercise of session.exercises ?? []) {
      const exerciseSets = sessionExercise.sets ?? [];
      sets += exerciseSets.length;
      for (const set of exerciseSets) volume += (set.weight ?? 0) * (set.reps ?? 0);
      const link = sessionExercise.exercise.match(/\[\[(.+?)\]\]/)?.[1];
      const exercise = link ? exercises.get(`${link}.md`) : undefined;
      for (const muscleGroup of exercise?.muscle_groups ?? []) {
        muscleGroups[muscleGroup] = (muscleGroups[muscleGroup] ?? 0) + exerciseSets.length;
      }
    }
  }
  return { sets, volume: Math.round(volume), muscleGroups };
}
