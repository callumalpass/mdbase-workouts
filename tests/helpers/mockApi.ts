import type { Page, Route } from "@playwright/test";

export interface MockApiController {
  requests: {
    quickLogs: any[];
    plans: any[];
    sessions: any[];
    sessionListQueries: Array<{ limit: number; offset: number }>;
  };
}

interface ExerciseRecord {
  path: string;
  name: string;
  muscle_groups: string[];
  equipment: string;
  tracking: "weight_reps" | "reps_only" | "timed" | "distance";
}

interface PlanRecord {
  path: string;
  date: string;
  title: string;
  status: "scheduled" | "completed" | "skipped";
  exercises: Array<{
    exercise: string;
    target_sets?: number;
    target_reps?: string | number;
    target_weight?: number;
    notes?: string;
  }>;
}

interface PlanTemplateRecord {
  path: string;
  title: string;
  exercises: Array<{
    exercise: string;
    target_sets?: number;
    target_reps?: string;
    target_weight?: number;
    notes?: string;
  }>;
}

interface SessionRecord {
  path: string;
  date: string;
  exercises: Array<{
    exercise: string;
    sets: Array<{
      reps?: number;
      weight?: number;
      duration_seconds?: number;
      distance?: number;
    }>;
  }>;
  duration_minutes?: number;
  rating?: number;
  notes?: string;
}

interface QuickLogRecord {
  path: string;
  exercise: string;
  reps?: number;
  weight?: number;
  duration_seconds?: number;
  distance?: number;
  logged_at: string;
}

function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function mkDate(offsetDays: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function setupMockApi(page: Page): Promise<MockApiController> {
  const today = localDay(new Date());

  const exercises: ExerciseRecord[] = [
    {
      path: "exercises/squat.md",
      name: "Squat",
      muscle_groups: ["quads", "glutes"],
      equipment: "barbell",
      tracking: "weight_reps",
    },
    {
      path: "exercises/bench-press.md",
      name: "Bench Press",
      muscle_groups: ["chest", "triceps"],
      equipment: "barbell",
      tracking: "weight_reps",
    },
    {
      path: "exercises/plank.md",
      name: "Plank",
      muscle_groups: ["core"],
      equipment: "bodyweight",
      tracking: "timed",
    },
    {
      path: "exercises/running.md",
      name: "Running",
      muscle_groups: ["cardio"],
      equipment: "none",
      tracking: "distance",
    },
  ];

  const plans: PlanRecord[] = [
    {
      path: `plans/${today}-full-body.md`,
      date: today,
      title: "Full Body",
      status: "scheduled",
      exercises: [
        { exercise: "[[exercises/squat]]", target_sets: 3, target_reps: 5, target_weight: 80 },
        { exercise: "[[exercises/bench-press]]", target_sets: 3, target_reps: 8, target_weight: 60 },
      ],
    },
  ];

  const templates: PlanTemplateRecord[] = [
    {
      path: "plan-templates/bench-template.md",
      title: "Bench Template",
      exercises: [
        { exercise: "[[exercises/bench-press]]", target_sets: 4, target_reps: "AMRAP", target_weight: 60 },
        { exercise: "[[exercises/plank]]", target_sets: 2, target_reps: "30s" },
      ],
    },
  ];

  const sessions: SessionRecord[] = Array.from({ length: 25 }, (_, idx) => ({
    path: `sessions/${String(idx + 1).padStart(3, "0")}.md`,
    date: mkDate(idx),
    exercises: [
      {
        exercise: "[[exercises/squat]]",
        sets: [{ reps: 5, weight: 100 + idx }],
      },
    ],
    duration_minutes: 40 + (idx % 10),
    rating: ((idx % 5) + 1),
  }));

  const quickLogs: QuickLogRecord[] = [
    {
      path: "quick-logs/seed-1.md",
      exercise: "[[exercises/bench-press]]",
      reps: 10,
      weight: 60,
      logged_at: new Date().toISOString(),
    },
  ];

  const requests = {
    quickLogs: [] as any[],
    plans: [] as any[],
    sessions: [] as any[],
    sessionListQueries: [] as Array<{ limit: number; offset: number }>,
  };

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (path === "/api/health" && method === "GET") {
      return json(route, { status: "ok" });
    }

    if (path === "/api/exercises" && method === "GET") {
      return json(route, exercises);
    }

    if (path === "/api/quick-logs" && method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? "50");
      return json(route, quickLogs.slice(0, limit));
    }

    if (path === "/api/quick-logs" && method === "POST") {
      const payload = JSON.parse(req.postData() || "{}");
      requests.quickLogs.push(payload);
      const ts = Date.now();
      quickLogs.unshift({
        path: `quick-logs/${ts}.md`,
        exercise: `[[exercises/${payload.exercise}]]`,
        reps: payload.reps,
        weight: payload.weight,
        duration_seconds: payload.duration_seconds,
        distance: payload.distance,
        logged_at: new Date().toISOString(),
      });
      return json(route, { ok: true }, 201);
    }

    if (path === "/api/plans" && method === "GET") {
      return json(route, plans);
    }

    if (path === "/api/plans" && method === "POST") {
      const payload = JSON.parse(req.postData() || "{}");
      requests.plans.push(payload);
      const slug = `${payload.date}-${slugify(payload.title)}`;
      plans.unshift({
        path: `plans/${slug}.md`,
        date: payload.date,
        title: payload.title,
        status: "scheduled",
        exercises: (payload.exercises || []).map((ex: any) => ({
          exercise: `[[exercises/${ex.exercise}]]`,
          target_sets: ex.target_sets,
          target_reps: ex.target_reps,
          target_weight: ex.target_weight,
        })),
      });
      return json(route, { ok: true }, 201);
    }

    if (path === "/api/sessions" && method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const offset = Number(url.searchParams.get("offset") ?? "0");
      requests.sessionListQueries.push({ limit, offset });
      const batch = sessions.slice(offset, offset + limit);
      return json(route, {
        sessions: batch,
        total: sessions.length,
        hasMore: offset + batch.length < sessions.length,
      });
    }

    if (path === "/api/sessions" && method === "POST") {
      const payload = JSON.parse(req.postData() || "{}");
      requests.sessions.push(payload);
      const id = `${Date.now()}`;
      sessions.unshift({
        path: `sessions/${id}.md`,
        date: payload.date,
        exercises: (payload.exercises || []).map((ex: any) => ({
          exercise: `[[exercises/${ex.exercise}]]`,
          sets: ex.sets || [],
        })),
        duration_minutes: payload.duration_minutes,
        rating: payload.rating,
        notes: payload.notes,
      });

      if (payload.plan) {
        const match = plans.find((p) => p.path.endsWith(`${payload.plan}.md`));
        if (match) match.status = "completed";
      }

      return json(route, { ok: true }, 201);
    }

    if (path === "/api/today" && method === "GET") {
      const todaysSessions = sessions.filter((s) => s.date.startsWith(today));
      const todaysPlans = plans.filter((p) => p.date === today);
      const todaysQuickLogs = quickLogs.filter((q) => q.logged_at.startsWith(today));
      return json(route, {
        date: today,
        plans: todaysPlans,
        sessions: todaysSessions,
        quickLogs: todaysQuickLogs,
        templates,
      });
    }

    if (path === "/api/stats" && method === "GET") {
      return json(route, {
        streak: {
          currentStreak: 21,
          longestRun: 33,
          thisWeekSessions: 3,
          bankedCheatDays: 2,
          cheatDayDates: [localDay(new Date(Date.now() - 2 * 86_400_000))],
          runStatus: {
            kind: "active",
            todayActive: true,
            quietDays: 0,
            lastActiveDate: today,
            recoverableStreak: null,
          },
        },
        prs: [],
        volume: {
          thisWeek: { sets: 18, volume: 3200 },
          lastWeek: { sets: 14, volume: 2600 },
          muscleGroups: {},
        },
      });
    }

    if (path === "/api/stats/weekly" && method === "GET") {
      return json(route, {
        weeks: [
          { weekStart: localDay(new Date(Date.now() - 7 * 86_400_000)), sets: 14, isCurrentWeek: false },
          { weekStart: today, sets: 18, isCurrentWeek: true },
        ],
      });
    }

    return json(route, { error: `Unhandled route: ${method} ${path}` }, 500);
  });

  return { requests };
}
