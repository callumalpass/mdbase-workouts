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
  QueryRecord,
  QueryResult,
  RecordDocument,
} from "@mdbase/connect";
import { activeConnection, connectionInfo } from "./connect";
import { computeWorkoutStats, computeWorkoutWeeklyStats } from "./workout-stats";
import { clearWorkoutCache } from "./workout-cache";

type QueryRow = QueryRecord<JsonObject> & JsonObject;
type WorkoutType =
  | "exercise"
  | "plan"
  | "plan-template"
  | "quick-log"
  | "session";

const CONTRACT_VERSION = "1.0.0";
const CONTRACTS: Record<WorkoutType, string> = {
  exercise: "mdbase.workouts.exercise",
  plan: "mdbase.workouts.plan",
  "plan-template": "mdbase.workouts.plan-template",
  "quick-log": "mdbase.workouts.quick-log",
  session: "mdbase.workouts.session",
};

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

function contract(type: WorkoutType, provider?: string) {
  return {
    id: CONTRACTS[type],
    version: CONTRACT_VERSION,
    ...(provider ? { type: provider } : {}),
  };
}

async function createProvider(type: WorkoutType): Promise<string> {
  const description = await requireConnection().describe();
  const descriptor = description.contracts.find(
    (candidate) =>
      candidate.id === CONTRACTS[type] &&
      candidate.version === CONTRACT_VERSION,
  );
  if (!descriptor?.implementations.length) {
    throw new Error(
      `This collection does not implement ${CONTRACTS[type]} ${CONTRACT_VERSION}.`,
    );
  }
  const providers = [...descriptor.implementations].sort((left, right) =>
    left.type_name.localeCompare(right.type_name)
  );
  return (
    providers.find((provider) => provider.type_name === type) ?? providers[0]
  ).type_name;
}

async function query(input: QueryInput): Promise<QueryResult> {
  return validResult(await requireConnection().query(input));
}

async function read(
  type: WorkoutType,
  path: string,
): Promise<RecordDocument<JsonObject>> {
  return validResult(
    await requireConnection().read({ path, contract: contract(type) }),
  );
}

async function create(
  type: WorkoutType,
  input: Omit<Parameters<MdbaseConnection["create"]>[0], "type" | "contract">,
): Promise<RecordDocument<JsonObject>> {
  const provider = await createProvider(type);
  const result = validResult(
    await requireConnection().create({
      ...input,
      contract: contract(type, provider),
    }),
  );
  invalidateConnectApiCache();
  return result;
}

async function update(
  type: WorkoutType,
  path: string,
  patch: JsonObject,
): Promise<RecordDocument<JsonObject>> {
  const result = validResult(
    await requireConnection().update({
      path,
      patch,
      contract: contract(type),
    }),
  );
  invalidateConnectApiCache();
  return result;
}

async function remove(type: WorkoutType, path: string): Promise<void> {
  validResult(
    await requireConnection().delete({ path, contract: contract(type) }),
  );
  invalidateConnectApiCache();
}

export function invalidateConnectApiCache(): void {
  sourceCache.clear();
  clearWorkoutCache();
}

function record<T>(row: QueryRow): T {
  return { path: row.path, ...row.frontmatter } as T;
}

function operationRecord<T>(value: RecordDocument<JsonObject>, fallbackPath: string): T {
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

async function rows(
  type: WorkoutType,
  extra: Pick<QueryInput, "limit" | "offset" | "frontmatter_mode"> = {},
): Promise<QueryRow[]> {
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
  const pending = query({ contract: contract(type), ...extra })
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

const allExerciseRows = async () =>
  [...(await rows("exercise", { limit: 20000 }))].sort((left, right) =>
    String(left.frontmatter?.name ?? "").localeCompare(
      String(right.frontmatter?.name ?? ""),
    ),
  );
const allSessionRows = async () =>
  [...(await rows("session", { limit: 20000 }))].sort((left, right) =>
    String(right.frontmatter?.date ?? "").localeCompare(
      String(left.frontmatter?.date ?? ""),
    ),
  );
const allQuickLogRows = async () =>
  [...(await rows("quick-log", { limit: 20000 }))].sort((left, right) =>
    String(right.frontmatter?.logged_at ?? "").localeCompare(
      String(left.frontmatter?.logged_at ?? ""),
    ),
  );
const allTemplateRows = () => rows("plan-template", { limit: 20000 });

async function exerciseHistory(slug: string): Promise<ExerciseHistory> {
  const [exerciseValue, sessionRows, quickLogRows] = await Promise.all([
    read("exercise", `exercises/${slug}.md`),
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
    get: async (slug: string) => operationRecord<Exercise>(await read("exercise", `exercises/${slug}.md`), `exercises/${slug}.md`),
    history: exerciseHistory,
    create: async (data: CreateExerciseInput) => {
      const path = `exercises/${slugify(data.name)}.md`;
      return operationRecord<Exercise>(await create("exercise", { path, frontmatter: { ...data } }), path);
    },
    update: async (slug: string, data: Partial<CreateExerciseInput>) => operationRecord<Exercise>(await update("exercise", `exercises/${slug}.md`, data), `exercises/${slug}.md`),
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
    list: async (limit = 50) => (await allQuickLogRows()).slice(0, limit).map((row) => record<QuickLog>(row)),
    create: async (data: CreateQuickLogInput) => {
      const now = new Date();
      const path = `quick-logs/${timestamp(now)}.md`;
      const frontmatter = { ...data, exercise: wikilink("exercises", data.exercise), logged_at: now.toISOString() };
      return operationRecord<QuickLog>(await create("quick-log", { path, frontmatter }), path);
    },
  },
  sessions: {
    list: async (limit = 20, offset = 0) => {
      const all = await allSessionRows();
      const sessions = all.slice(offset, offset + limit).map((row) => record<Session>(row));
      return { sessions, total: all.length, hasMore: offset + sessions.length < all.length };
    },
    get: async (id: string) => operationRecord<Session>(await read("session", `sessions/${id}.md`), `sessions/${id}.md`),
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
      const session = operationRecord<Session>(await create("session", { path, frontmatter }), path);
      if (data.plan) await update("plan", `plans/${data.plan}.md`, { status: "completed", session: wikilink("sessions", id) });
      return session;
    },
    update: async (id: string, data: Partial<Session>) => operationRecord<Session>(await update("session", `sessions/${id}.md`, data), `sessions/${id}.md`),
    delete: async (id: string) => { await remove("session", `sessions/${id}.md`); return { ok: true }; },
  },
  plans: {
    list: async (status?: string) => {
      const plans = [...(await rows("plan", { limit: 20000 }))]
        .map((row) => record<Plan>(row))
        .filter((plan) => !status || plan.status === status);
      return plans.sort((left, right) => right.date.localeCompare(left.date));
    },
    get: async (id: string) => operationRecord<Plan>(await read("plan", `plans/${id}.md`), `plans/${id}.md`),
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
      return operationRecord<Plan>(await create("plan", { path, frontmatter }), path);
    },
    update: async (id: string, data: Partial<Plan>) => operationRecord<Plan>(await update("plan", `plans/${id}.md`, data), `plans/${id}.md`),
  },
  planTemplates: {
    list: async () => (await allTemplateRows()).map((row) => record<PlanTemplate>(row)),
    get: async (id: string) => operationRecord<PlanTemplate>(await read("plan-template", `plan-templates/${id}.md`), `plan-templates/${id}.md`),
    create: async (data: CreatePlanTemplateInput) => {
      const path = `plan-templates/${slugify(data.title)}.md`;
      const frontmatter = { ...data, exercises: data.exercises.map((item) => ({ ...item, exercise: wikilink("exercises", item.exercise) })) };
      return operationRecord<PlanTemplate>(await create("plan-template", { path, frontmatter }), path);
    },
    update: async (id: string, data: Partial<PlanTemplate>) => operationRecord<PlanTemplate>(await update("plan-template", `plan-templates/${id}.md`, data), `plan-templates/${id}.md`),
    delete: async (id: string) => { await remove("plan-template", `plan-templates/${id}.md`); return { ok: true }; },
  },
  stats: { get: stats, weekly: weeklyStats },
  today: async (timeZone?: string) => {
    const today = dateKey(new Date(), timeZone);
    const [planRows, sessionRows, quickLogRows, templateRows] = await Promise.all([
      rows("plan", { limit: 20000 }),
      rows("session", { limit: 20000 }),
      rows("quick-log", { limit: 20000 }),
      allTemplateRows(),
    ]);
    return {
      date: today,
      plans: planRows.map((row) => record<Plan>(row)).filter((plan) => plan.date === today),
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
