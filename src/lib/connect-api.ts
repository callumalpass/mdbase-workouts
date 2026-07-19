import type {
  CreateExerciseInput,
  CreatePlanInput,
  CreatePlanTemplateInput,
  CreateQuickLogInput,
  CreateSessionInput,
  Exercise,
  ExerciseHistory,
  ExerciseHistoryEntry,
  LastSetsResponse,
  Plan,
  PlanTemplate,
  QuickLog,
  Session,
  SetData,
  StatsResponse,
  WeeklyStatsResponse,
} from "./types";
import { connect, connectionInfo } from "./connect";
import { computeWorkoutStats, computeWorkoutWeeklyStats } from "./workout-stats";

interface QueryRow {
  path: string;
  frontmatter: Record<string, unknown>;
}

interface QueryResult {
  results?: QueryRow[];
  meta?: { total_count?: number; has_more?: boolean };
  error?: { message?: string } | string;
}

interface OperationEnvelope {
  valid?: boolean;
  result?: Record<string, unknown>;
  diagnostics?: Array<{ message?: string; severity?: string }>;
  error?: { message?: string } | string;
}

function requireConnection() {
  const value = connectionInfo();
  if (!value) throw new Error("Choose a workout collection before loading records.");
  return value;
}

function errorMessage(error: QueryResult["error"] | OperationEnvelope["error"]): string {
  if (!error) return "MDBASE operation failed.";
  return typeof error === "string" ? error : error.message || "MDBASE operation failed.";
}

function unwrapOperation(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("MDBASE returned an invalid operation result.");
  const envelope = value as OperationEnvelope;
  if (envelope.error) throw new Error(errorMessage(envelope.error));
  if (envelope.valid === false) {
    const diagnostic = envelope.diagnostics?.find((item) => item.severity === "error") ?? envelope.diagnostics?.[0];
    throw new Error(diagnostic?.message || "The collection rejected this change.");
  }
  return envelope.result && typeof envelope.result === "object" ? envelope.result : value as Record<string, unknown>;
}

async function query(input: Record<string, unknown>): Promise<QueryResult> {
  requireConnection();
  const value = await connect.query(input) as QueryResult;
  if (value.error) throw new Error(errorMessage(value.error));
  return value;
}

async function read(path: string): Promise<Record<string, unknown>> {
  requireConnection();
  return unwrapOperation(await connect.read({ path }));
}

async function create(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  requireConnection();
  return unwrapOperation(await connect.create(input));
}

async function update(path: string, fields: Record<string, unknown>): Promise<Record<string, unknown>> {
  requireConnection();
  return unwrapOperation(await connect.update({ path, fields }));
}

async function remove(path: string): Promise<void> {
  requireConnection();
  unwrapOperation(await connect.delete({ path }));
}

function record<T>(row: QueryRow): T {
  return { path: row.path, ...row.frontmatter } as T;
}

function operationRecord<T>(value: Record<string, unknown>, fallbackPath: string): T {
  const frontmatter = value.frontmatter && typeof value.frontmatter === "object"
    ? value.frontmatter as Record<string, unknown>
    : {};
  const file = value.file && typeof value.file === "object" ? value.file as { path?: string } : undefined;
  return { path: String(value.path ?? file?.path ?? fallbackPath), ...frontmatter } as T;
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "record";
}

function timestamp(date = new Date()): string {
  return date.toISOString()
    .split("-").join("")
    .split(":").join("")
    .split("T").join("")
    .split("Z").join("")
    .split(".").join("")
    .slice(0, 17);
}

function wikilink(folder: string, slug: string): string {
  return `[[${folder}/${slug}]]`;
}

function dateKey(value: string | Date, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function rows(type: string, extra: Record<string, unknown> = {}): Promise<QueryRow[]> {
  const result = await query({ types: [type], include_body: false, ...extra });
  return result.results ?? [];
}

async function exerciseHistory(slug: string): Promise<ExerciseHistory> {
  const [exerciseValue, sessionRows, quickLogRows] = await Promise.all([
    read(`exercises/${slug}.md`),
    rows("session", { order_by: [{ field: "date", direction: "desc" }] }),
    rows("quick-log", { order_by: [{ field: "logged_at", direction: "desc" }] }),
  ]);
  const exercise = operationRecord<Exercise>(exerciseValue, `exercises/${slug}.md`);
  const target = wikilink("exercises", slug);
  const entries: ExerciseHistoryEntry[] = [];
  for (const row of sessionRows) {
    const session = record<Session>(row);
    for (const item of session.exercises ?? []) {
      if (item.exercise === target) {
        entries.push({ source: "session", date: session.date, sets: item.sets ?? [], sessionPath: session.path });
      }
    }
  }
  for (const row of quickLogRows) {
    const log = record<QuickLog>(row);
    if (log.exercise !== target) continue;
    const set: SetData = {};
    if (log.reps != null) set.reps = log.reps;
    if (log.weight != null) set.weight = log.weight;
    if (log.duration_seconds != null) set.duration_seconds = log.duration_seconds;
    if (log.distance != null) set.distance = log.distance;
    entries.push({ source: "quick-log", date: log.logged_at, sets: [set] });
  }
  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const allSets = entries.flatMap((entry) => entry.sets);
  const stats: ExerciseHistory["stats"] = {
    totalEntries: entries.length,
    firstLogged: entries.length ? entries[entries.length - 1].date : null,
    lastLogged: entries[0]?.date ?? null,
  };
  if (exercise.tracking === "weight_reps") {
    const best = allSets.reduce<SetData | null>((current, set) => (set.weight ?? 0) > (current?.weight ?? 0) ? set : current, null);
    stats.prWeight = best?.weight ?? 0;
    stats.prSet = best ? `${best.weight ?? 0}kg × ${best.reps ?? 0}` : "";
    stats.totalVolume = allSets.reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0);
    const sessions = entries.filter((entry) => entry.source === "session");
    stats.avgSetsPerSession = sessions.length ? +(sessions.reduce((sum, entry) => sum + entry.sets.length, 0) / sessions.length).toFixed(1) : 0;
  } else if (exercise.tracking === "reps_only") {
    stats.maxReps = Math.max(0, ...allSets.map((set) => set.reps ?? 0));
    stats.totalReps = allSets.reduce((sum, set) => sum + (set.reps ?? 0), 0);
  } else if (exercise.tracking === "timed") {
    stats.longestDuration = Math.max(0, ...allSets.map((set) => set.duration_seconds ?? 0));
    stats.totalDuration = allSets.reduce((sum, set) => sum + (set.duration_seconds ?? 0), 0);
  } else {
    stats.longestDistance = Math.max(0, ...allSets.map((set) => set.distance ?? 0));
    stats.totalDistance = allSets.reduce((sum, set) => sum + (set.distance ?? 0), 0);
  }
  return { exercise, entries, stats };
}

async function stats(timeZone?: string): Promise<StatsResponse> {
  const [sessionRows, exerciseRows, quickLogRows] = await Promise.all([
    rows("session", { order_by: [{ field: "date", direction: "desc" }], limit: 5000 }),
    rows("exercise"),
    rows("quick-log", { limit: 5000 }),
  ]);
  return computeWorkoutStats({
    sessions: sessionRows.map((row) => record<Session>(row)),
    exercises: exerciseRows.map((row) => record<Exercise>(row)),
    quickLogs: quickLogRows.map((row) => record<QuickLog>(row)),
    timeZone,
  });
}

async function weeklyStats(timeZone?: string): Promise<WeeklyStatsResponse> {
  const [sessionRows, quickLogRows] = await Promise.all([
    rows("session", { limit: 20000 }),
    rows("quick-log", { limit: 20000 }),
  ]);
  return computeWorkoutWeeklyStats({
    sessions: sessionRows.map((row) => record<Session>(row)),
    quickLogs: quickLogRows.map((row) => record<QuickLog>(row)),
    timeZone,
  });
}

export const connectApi = {
  exercises: {
    list: async () => (await rows("exercise", { order_by: [{ field: "name", direction: "asc" }] })).map((row) => record<Exercise>(row)),
    get: async (slug: string) => operationRecord<Exercise>(await read(`exercises/${slug}.md`), `exercises/${slug}.md`),
    history: exerciseHistory,
    create: async (data: CreateExerciseInput) => {
      const path = `exercises/${slugify(data.name)}.md`;
      return operationRecord<Exercise>(await create({ path, type: "exercise", frontmatter: data }), path);
    },
    update: async (slug: string, data: Partial<CreateExerciseInput>) => operationRecord<Exercise>(await update(`exercises/${slug}.md`, data), `exercises/${slug}.md`),
    lastSets: async (slugs: string[]) => {
      const sessionRows = await rows("session", { order_by: [{ field: "date", direction: "desc" }] });
      const remaining = new Set(slugs);
      const output: LastSetsResponse = {};
      for (const row of sessionRows) {
        const session = record<Session>(row);
        for (const item of session.exercises ?? []) {
          const slug = slugs.find((candidate) => item.exercise === wikilink("exercises", candidate));
          if (slug && remaining.has(slug)) {
            output[slug] = { date: session.date, sets: item.sets ?? [] };
            remaining.delete(slug);
          }
        }
        if (!remaining.size) break;
      }
      return output;
    },
  },
  quickLogs: {
    list: async (limit = 50) => (await rows("quick-log", { order_by: [{ field: "logged_at", direction: "desc" }], limit })).map((row) => record<QuickLog>(row)),
    create: async (data: CreateQuickLogInput) => {
      const now = new Date();
      const path = `quick-logs/${timestamp(now)}.md`;
      const frontmatter = { ...data, exercise: wikilink("exercises", data.exercise), logged_at: now.toISOString() };
      return operationRecord<QuickLog>(await create({ path, type: "quick-log", frontmatter }), path);
    },
  },
  sessions: {
    list: async (limit = 20, offset = 0) => {
      const result = await query({ types: ["session"], order_by: [{ field: "date", direction: "desc" }], limit, offset, include_body: false });
      const sessions = (result.results ?? []).map((row) => record<Session>(row));
      return { sessions, total: result.meta?.total_count ?? sessions.length, hasMore: result.meta?.has_more ?? false };
    },
    get: async (id: string) => operationRecord<Session>(await read(`sessions/${id}.md`), `sessions/${id}.md`),
    create: async (data: CreateSessionInput) => {
      const now = new Date();
      const id = timestamp(now);
      const path = `sessions/${id}.md`;
      const frontmatter: Record<string, unknown> = {
        ...data,
        date: data.date || now.toISOString(),
        exercises: data.exercises.map((item) => ({ ...item, exercise: wikilink("exercises", item.exercise) })),
        ...(data.plan ? { plan: wikilink("plans", data.plan) } : {}),
      };
      const session = operationRecord<Session>(await create({ path, type: "session", frontmatter }), path);
      if (data.plan) await update(`plans/${data.plan}.md`, { status: "completed", session: wikilink("sessions", id) });
      return session;
    },
    update: async (id: string, data: Partial<Session>) => operationRecord<Session>(await update(`sessions/${id}.md`, data), `sessions/${id}.md`),
    delete: async (id: string) => { await remove(`sessions/${id}.md`); return { ok: true }; },
  },
  plans: {
    list: async (status?: string) => (await rows("plan", {
      ...(status ? { where: `status == "${status}"` } : {}),
      order_by: [{ field: "date", direction: "desc" }],
    })).map((row) => record<Plan>(row)),
    get: async (id: string) => operationRecord<Plan>(await read(`plans/${id}.md`), `plans/${id}.md`),
    create: async (data: CreatePlanInput) => {
      const date = data.date || dateKey(new Date());
      const id = `${date}-${slugify(data.title)}`;
      const path = `plans/${id}.md`;
      const frontmatter = {
        ...data,
        date,
        status: "scheduled",
        exercises: data.exercises.map((item) => ({ ...item, exercise: wikilink("exercises", item.exercise) })),
      };
      return operationRecord<Plan>(await create({ path, type: "plan", frontmatter }), path);
    },
    update: async (id: string, data: Partial<Plan>) => operationRecord<Plan>(await update(`plans/${id}.md`, data), `plans/${id}.md`),
  },
  planTemplates: {
    list: async () => (await rows("plan-template")).map((row) => record<PlanTemplate>(row)),
    get: async (id: string) => operationRecord<PlanTemplate>(await read(`plan-templates/${id}.md`), `plan-templates/${id}.md`),
    create: async (data: CreatePlanTemplateInput) => {
      const path = `plan-templates/${slugify(data.title)}.md`;
      const frontmatter = { ...data, exercises: data.exercises.map((item) => ({ ...item, exercise: wikilink("exercises", item.exercise) })) };
      return operationRecord<PlanTemplate>(await create({ path, type: "plan-template", frontmatter }), path);
    },
    update: async (id: string, data: Partial<PlanTemplate>) => operationRecord<PlanTemplate>(await update(`plan-templates/${id}.md`, data), `plan-templates/${id}.md`),
    delete: async (id: string) => { await remove(`plan-templates/${id}.md`); return { ok: true }; },
  },
  stats: { get: stats, weekly: weeklyStats },
  today: async (timeZone?: string) => {
    const today = dateKey(new Date(), timeZone);
    const [planRows, sessionRows, quickLogRows, templateRows] = await Promise.all([
      rows("plan", { where: `date == "${today}"`, order_by: [{ field: "date", direction: "asc" }] }),
      rows("session", { order_by: [{ field: "date", direction: "desc" }], limit: 250 }),
      rows("quick-log", { order_by: [{ field: "logged_at", direction: "desc" }], limit: 250 }),
      rows("plan-template"),
    ]);
    return {
      date: today,
      plans: planRows.map((row) => record<Plan>(row)),
      sessions: sessionRows.map((row) => record<Session>(row)).filter((session) => dateKey(session.date, timeZone) === today),
      quickLogs: quickLogRows.map((row) => record<QuickLog>(row)).filter((log) => dateKey(log.logged_at, timeZone) === today),
      templates: templateRows.map((row) => record<PlanTemplate>(row)),
    };
  },
  settings: {
    get: async () => ({ dataDir: connectionInfo()?.collectionId ?? "", configDataDir: "MDBASE Connect" }),
    update: async () => { throw new Error("Collection folders are managed in MDBASE Connect."); },
  },
};
