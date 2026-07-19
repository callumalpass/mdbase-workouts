import { describe, expect, it } from "vitest";
import type { Exercise, QuickLog, Session } from "./types";
import { computeWorkoutStats, computeWorkoutWeeklyStats } from "./workout-stats";

const bench: Exercise = {
  path: "exercises/bench-press.md",
  name: "Bench Press",
  muscle_groups: ["chest", "triceps"],
  equipment: "barbell",
  tracking: "weight_reps",
};

function session(date: string, weight = 0, reps = 0): Session {
  return {
    path: `sessions/${date}.md`,
    date,
    exercises: weight ? [{ exercise: "[[exercises/bench-press]]", sets: [{ weight, reps }] }] : [],
  };
}

function log(date: string): QuickLog {
  return { path: `quick-logs/${date}.md`, exercise: "[[exercises/bench-press]]", logged_at: date, reps: 1 };
}

describe("shared workout statistics", () => {
  it("preserves hinge-day streak semantics", () => {
    const result = computeWorkoutStats({
      sessions: [session("2026-05-26T10:00:00.000Z"), session("2026-05-29T09:00:00.000Z")],
      exercises: [],
      quickLogs: [log("2026-05-27T09:00:00.000Z"), log("2026-05-28T09:00:00.000Z")],
      timeZone: "Australia/Melbourne",
      now: new Date("2026-05-31T06:00:00.000Z"),
    });

    expect(result.streak.currentStreak).toBe(0);
    expect(result.streak.runStatus).toEqual({
      kind: "hinge-day",
      todayActive: false,
      quietDays: 2,
      lastActiveDate: "2026-05-29",
      recoverableStreak: 5,
    });
  });

  it("computes PRs, rolling volume, and muscle groups", () => {
    const result = computeWorkoutStats({
      sessions: [
        session("2026-05-20T09:00:00.000Z", 90, 5),
        session("2026-05-30T09:00:00.000Z", 100, 5),
        session("2026-05-31T09:00:00.000Z", 110, 3),
      ],
      exercises: [bench],
      quickLogs: [],
      now: new Date("2026-05-31T12:00:00.000Z"),
    });

    expect(result.prs.map((pr) => pr.type)).toEqual(["weight", "e1rm"]);
    expect(result.volume.thisWeek).toEqual({ sets: 2, volume: 830 });
    expect(result.volume.lastWeek).toEqual({ sets: 1, volume: 450 });
    expect(result.volume.muscleGroups).toEqual({ chest: 2, triceps: 2 });
  });

  it("counts quick logs and fills gaps in weekly totals", () => {
    const result = computeWorkoutWeeklyStats({
      sessions: [session("2026-05-04T09:00:00.000Z", 50, 5)],
      quickLogs: [log("2026-05-18T09:00:00.000Z")],
      timeZone: "UTC",
      now: new Date("2026-05-20T12:00:00.000Z"),
    });
    expect(result.weeks).toEqual([
      { weekStart: "2026-05-04", sets: 1, isCurrentWeek: false },
      { weekStart: "2026-05-11", sets: 0, isCurrentWeek: false },
      { weekStart: "2026-05-18", sets: 1, isCurrentWeek: true },
    ]);
  });
});
