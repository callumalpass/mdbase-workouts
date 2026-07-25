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
import type {
  JsonObject,
  MdbaseConnection,
  MdbaseOperationEnvelope,
  QueryInput,
  QueryResult,
  RecordResult,
  RecordSummary,
} from "@mdbase/connect";
import { activeConnection, connectionInfo } from "./connect";
import { computeWorkoutStats, computeWorkoutWeeklyStats } from "./workout-stats";
import { clearWorkoutCache } from "./workout-cache";

type QueryRow = RecordSummary<JsonObject> & JsonObject;

const SOURCE_FRESH_MS = 30_000;
const sourceCache = new Map<string, {
  collectionId: string;
  savedAt?: number;
  value?: QueryRow[];
  pending?: Promise<QueryRow[]>;
}>();

function requireConnection() {
  const connection = activeConnection();
  if (!connection) throw new Error("Choose a workout collection before loading records.");
  return connection;
}

function validResult<Result>(envelope: MdbaseOperationEnvelope<Result>): Result {
  if (!envelope.valid) {
    const diagnostic = envelope.diagnostics.find((item) => item.severity === "error") ?? envelope.diagnostics[0];
    throw new Error(diagnostic?.message || "The collection rejected this change.");
  }
  return envelope.result;
}

async function query(input: QueryInput): Promise<QueryResult> {
  return validResult(await requireConnection().query(input));
}

async function read(path: string): Promise<RecordResult> {
  return validResult(await requireConnection().read({ path }));
}

async function create(input: Parameters<MdbaseConnection["create"]>[0]): Promise<RecordResult> {
  const result = validResult(await requireConnection().create(input));
  invalidateConnectApiCache();
  return result;
}

async function update(path: string, patch: JsonObject): Promise<RecordResult> {
  const result = validResult(await requireConnection().update({ path, patch }));
  invalidateConnectApiCache();
  return result;
}

async function remove(path: string): Promise<void> {
  validResult(await requireConnection().delete({ path }));
  invalidateConnectApiCache();
}

export function invalidateConnectApiCache(): void {
  sourceCache.clear();
  clearWorkoutCache();
}

function record<T>(row: QueryRow): T {
  return { path: row.path, ...row.frontmatter } as T;
}

function operationRecord<T>(value: RecordResult, fallbackPath: string): T {
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

async function rows(type: string, extra: QueryInput = {}): Promise<QueryRow[]> {
  const collectionId = requireConnection().collectionId;
  const key = `${type}:${JSON.stringify(extra)}`;
  const cached = sourceCache.get(key);
  if (cached?.collectionId === collectionId) {
    if (cached.value && cached.savedAt && Date.now() - cached.savedAt < SOURCE_FRESH_MS) {
      return cached.value;
    }
    if (cached.pending) return cached.pending;
  }

  let entry: {
    collectionId: string;
    pending: Promise<QueryRow[]>;
  };
  const pending = query({ types: [type], include_body: false, ...extra })
    .then((result) => result.results ?? [])
    .then((value) => {
      if (sourceCache.get(key) === entry) {
        sourceCache.set(key, { collectionId, savedAt: Date.now(), value });
      }
      return value;
    })
    .catch((error) => {
      if (sourceCache.get(key) === entry) sourceCache.delete(key);
      throw error;
    });
  entry = { collectionId, pending };
  sourceCache.set(key, entry);
  return pending;
}

const allExerciseRows = () => rows("exercise", { order_by: [{ field: "name", direction: "asc" }] });
const allSessionRows = () => rows("session", { order_by: [{ field: "date", direction: "desc" }], limit: 20000 });
const allQuickLogRows = () => rows("quick-log", { order_by: [{ field: "logged_at", direction: "desc" }], limit: 20000 });
const allTemplateRows = () => rows("plan-template");

async function exerciseHistory(slug: string): Promise<ExerciseHistory> {
  const [exerciseValue, sessionRows, quickLogRows] = await Promise.all([
    read(`exercises/${slug}.md`),
    allSessionRows(),
    allQuickLogRows(),
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
    allSessionRows(),
    allExerciseRows(),
    allQuickLogRows(),
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
    allSessionRows(),
    allQuickLogRows(),
  ]);
  return computeWorkoutWeeklyStats({
    sessions: sessionRows.map((row) => record<Session>(row)),
    quickLogs: quickLogRows.map((row) => record<QuickLog>(row)),
    timeZone,
  });
}

export const connectApi = {
  exercises: {
    list: async () => (await allExerciseRows()).map((row) => record<Exercise>(row)),
    get: async (slug: string) => operationRecord<Exercise>(await read(`exercises/${slug}.md`), `exercises/${slug}.md`),
    history: exerciseHistory,
    create: async (data: CreateExerciseInput) => {
      const path = `exercises/${slugify(data.name)}.md`;
      return operationRecord<Exercise>(await create({ path, type: "exercise", frontmatter: { ...data } }), path);
    },
    update: async (slug: string, data: Partial<CreateExerciseInput>) => operationRecord<Exercise>(await update(`exercises/${slug}.md`, data), `exercises/${slug}.md`),
    lastSets: async (slugs: string[]) => {
      const sessionRows = await allSessionRows();
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
    list: async () => (await allTemplateRows()).map((row) => record<PlanTemplate>(row)),
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
      allTemplateRows(),
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
    get: async () => {
      const description = await requireConnection().describe();
      return {
        dataDir: connectionInfo()?.collectionId ?? "",
        configDataDir: "mdbase connect",
        collectionName: description.display_name,
      };
    },
    update: async () => { throw new Error("Collection folders are managed in mdbase connect."); },
  },
};
