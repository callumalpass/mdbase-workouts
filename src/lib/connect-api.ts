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
  ConnectOutcome,
  ConnectRequestOptions,
  JsonObject,
  MdbaseConnection,
  QueryInput,
  QueryRecord,
  QueryResult,
  RecordDocument,
} from "@mdbase-dev/connect";
import { unwrapConnectOutcome } from "@mdbase-dev/connect";
import { rememberWorkoutPendingMutation, requireWorkoutConnection } from "./connect";
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
const READ_TIMEOUT_MS = 10_000;
const WRITE_TIMEOUT_MS = 20_000;
let cacheGeneration = 0;
const sourceCache = new Map<string, {
  collectionId: string;
  generation: number;
  savedAt?: number;
  value?: QueryRow[];
  pending?: Promise<QueryRow[]>;
}>();

function validResult<Result>(outcome: ConnectOutcome<Result>): Result {
  return unwrapConnectOutcome(outcome);
}

function contract(type: WorkoutType, provider?: string) {
  return {
    id: CONTRACTS[type],
    version: CONTRACT_VERSION,
    ...(provider ? { type: provider } : {}),
  };
}

async function createProvider(type: WorkoutType, options: ConnectRequestOptions = {}): Promise<string> {
  const description = unwrapConnectOutcome(
    await requireWorkoutConnection().describe(withTimeout(options, READ_TIMEOUT_MS)),
  );
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

async function query(input: QueryInput, options: ConnectRequestOptions = {}): Promise<QueryResult> {
  return validResult(await requireWorkoutConnection().query(input, withTimeout(options, READ_TIMEOUT_MS)));
}

async function read(
  type: WorkoutType,
  path: string,
  options: ConnectRequestOptions = {},
): Promise<RecordDocument<JsonObject>> {
  return validResult(
    await requireWorkoutConnection().read(
      { path, contract: contract(type) },
      withTimeout(options, READ_TIMEOUT_MS),
    ),
  );
}

async function create(
  type: WorkoutType,
  input: Omit<Parameters<MdbaseConnection["create"]>[0], "type" | "contract">,
  options: ConnectRequestOptions = {},
): Promise<RecordDocument<JsonObject>> {
  const provider = await createProvider(type, options);
  try {
    return validResult(
      await requireWorkoutConnection().create({
        ...input,
        contract: contract(type, provider),
      }, withTimeout(options, WRITE_TIMEOUT_MS)),
    );
  } catch (error) {
    rememberWorkoutPendingMutation(error);
    throw error;
  } finally {
    invalidateConnectApiCache();
  }
}

async function update(
  type: WorkoutType,
  path: string,
  patch: JsonObject,
  options: ConnectRequestOptions = {},
): Promise<RecordDocument<JsonObject>> {
  try {
    return validResult(
      await requireWorkoutConnection().update({
        path,
        patch,
        contract: contract(type),
      }, withTimeout(options, WRITE_TIMEOUT_MS)),
    );
  } catch (error) {
    rememberWorkoutPendingMutation(error);
    throw error;
  } finally {
    invalidateConnectApiCache();
  }
}

async function remove(type: WorkoutType, path: string, options: ConnectRequestOptions = {}): Promise<void> {
  try {
    validResult(
      await requireWorkoutConnection().delete(
        { path, contract: contract(type) },
        withTimeout(options, WRITE_TIMEOUT_MS),
      ),
    );
  } catch (error) {
    rememberWorkoutPendingMutation(error);
    throw error;
  } finally {
    invalidateConnectApiCache();
  }
}

export function invalidateConnectApiCache(): void {
  cacheGeneration += 1;
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
  options: ConnectRequestOptions = {},
): Promise<QueryRow[]> {
  const collectionId = requireWorkoutConnection().collectionId;
  const key = `${type}:${JSON.stringify(extra)}`;
  const cached = sourceCache.get(key);
  if (cached?.collectionId === collectionId) {
    if (cached.value && cached.savedAt && Date.now() - cached.savedAt < SOURCE_FRESH_MS) {
      return cached.value;
    }
    if (cached.pending) return awaitWithSignal(cached.pending, options.signal);
  }

  const generation = cacheGeneration;
  const { signal, ...sharedOptions } = options;
  let entry: {
    collectionId: string;
    generation: number;
    pending: Promise<QueryRow[]>;
  };
  const pending = query({ contract: contract(type), ...extra }, sharedOptions)
    .then((result) => result.results ?? [])
    .then((value) => {
      if (sourceCache.get(key) === entry && generation === cacheGeneration) {
        sourceCache.set(key, { collectionId, generation, savedAt: Date.now(), value });
      }
      return value;
    })
    .catch((error) => {
      if (sourceCache.get(key) === entry) sourceCache.delete(key);
      throw error;
    });
  entry = { collectionId, generation, pending };
  sourceCache.set(key, entry);
  return awaitWithSignal(pending, signal);
}

const allExerciseRows = async (options: ConnectRequestOptions = {}) =>
  [...(await rows("exercise", { limit: 20000 }, options))].sort((left, right) =>
    String(left.frontmatter?.name ?? "").localeCompare(
      String(right.frontmatter?.name ?? ""),
    ),
  );
const allSessionRows = async (options: ConnectRequestOptions = {}) =>
  [...(await rows("session", { limit: 20000 }, options))].sort((left, right) =>
    String(right.frontmatter?.date ?? "").localeCompare(
      String(left.frontmatter?.date ?? ""),
    ),
  );
const allQuickLogRows = async (options: ConnectRequestOptions = {}) =>
  [...(await rows("quick-log", { limit: 20000 }, options))].sort((left, right) =>
    String(right.frontmatter?.logged_at ?? "").localeCompare(
      String(left.frontmatter?.logged_at ?? ""),
    ),
  );
const allTemplateRows = (options: ConnectRequestOptions = {}) => rows("plan-template", { limit: 20000 }, options);

function withTimeout(options: ConnectRequestOptions, timeoutMs: number): ConnectRequestOptions {
  return { ...options, timeoutMs: options.timeoutMs ?? timeoutMs };
}

function awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError(signal));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Workout request aborted", "AbortError");
}

async function exerciseHistory(slug: string, options: ConnectRequestOptions = {}): Promise<ExerciseHistory> {
  const [exerciseValue, sessionRows, quickLogRows] = await Promise.all([
    read("exercise", `exercises/${slug}.md`, options),
    allSessionRows(options),
    allQuickLogRows(options),
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

async function stats(timeZone?: string, options: ConnectRequestOptions = {}): Promise<StatsResponse> {
  const [sessionRows, exerciseRows, quickLogRows] = await Promise.all([
    allSessionRows(options),
    allExerciseRows(options),
    allQuickLogRows(options),
  ]);
  return computeWorkoutStats({
    sessions: sessionRows.map((row) => record<Session>(row)),
    exercises: exerciseRows.map((row) => record<Exercise>(row)),
    quickLogs: quickLogRows.map((row) => record<QuickLog>(row)),
    timeZone,
  });
}

async function weeklyStats(timeZone?: string, options: ConnectRequestOptions = {}): Promise<WeeklyStatsResponse> {
  const [sessionRows, quickLogRows] = await Promise.all([
    allSessionRows(options),
    allQuickLogRows(options),
  ]);
  return computeWorkoutWeeklyStats({
    sessions: sessionRows.map((row) => record<Session>(row)),
    quickLogs: quickLogRows.map((row) => record<QuickLog>(row)),
    timeZone,
  });
}

export const connectApi = {
  exercises: {
    list: async (options: ConnectRequestOptions = {}) => (await allExerciseRows(options)).map((row) => record<Exercise>(row)),
    get: async (slug: string, options: ConnectRequestOptions = {}) => operationRecord<Exercise>(await read("exercise", `exercises/${slug}.md`, options), `exercises/${slug}.md`),
    history: exerciseHistory,
    create: async (data: CreateExerciseInput, options: ConnectRequestOptions = {}) => {
      const path = `exercises/${slugify(data.name)}.md`;
      return operationRecord<Exercise>(await create("exercise", { path, frontmatter: { ...data } }, options), path);
    },
    update: async (slug: string, data: Partial<CreateExerciseInput>, options: ConnectRequestOptions = {}) => operationRecord<Exercise>(await update("exercise", `exercises/${slug}.md`, data, options), `exercises/${slug}.md`),
    lastSets: async (slugs: string[], options: ConnectRequestOptions = {}) => {
      const sessionRows = await allSessionRows(options);
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
    list: async (limit = 50, options: ConnectRequestOptions = {}) => (await allQuickLogRows(options)).slice(0, limit).map((row) => record<QuickLog>(row)),
    create: async (data: CreateQuickLogInput, options: ConnectRequestOptions = {}) => {
      const now = new Date();
      const path = `quick-logs/${timestamp(now)}.md`;
      const frontmatter = { ...data, exercise: wikilink("exercises", data.exercise), logged_at: now.toISOString() };
      return operationRecord<QuickLog>(await create("quick-log", { path, frontmatter }, options), path);
    },
  },
  sessions: {
    list: async (limit = 20, offset = 0, options: ConnectRequestOptions = {}) => {
      const all = await allSessionRows(options);
      const sessions = all.slice(offset, offset + limit).map((row) => record<Session>(row));
      return { sessions, total: all.length, hasMore: offset + sessions.length < all.length };
    },
    get: async (id: string, options: ConnectRequestOptions = {}) => operationRecord<Session>(await read("session", `sessions/${id}.md`, options), `sessions/${id}.md`),
    create: async (data: CreateSessionInput, options: ConnectRequestOptions = {}) => {
      const now = new Date();
      const id = timestamp(now);
      const path = `sessions/${id}.md`;
      const frontmatter: Record<string, unknown> = {
        ...data,
        date: data.date || now.toISOString(),
        exercises: data.exercises.map((item) => ({ ...item, exercise: wikilink("exercises", item.exercise) })),
        ...(data.plan ? { plan: wikilink("plans", data.plan) } : {}),
      };
      const session = operationRecord<Session>(await create("session", { path, frontmatter }, options), path);
      if (data.plan) await update("plan", `plans/${data.plan}.md`, { status: "completed", session: wikilink("sessions", id) }, options);
      return session;
    },
    update: async (id: string, data: Partial<Session>, options: ConnectRequestOptions = {}) => operationRecord<Session>(await update("session", `sessions/${id}.md`, data, options), `sessions/${id}.md`),
    delete: async (id: string, options: ConnectRequestOptions = {}) => { await remove("session", `sessions/${id}.md`, options); return { ok: true }; },
  },
  plans: {
    list: async (status?: string, options: ConnectRequestOptions = {}) => {
      const plans = [...(await rows("plan", { limit: 20000 }, options))]
        .map((row) => record<Plan>(row))
        .filter((plan) => !status || plan.status === status);
      return plans.sort((left, right) => right.date.localeCompare(left.date));
    },
    get: async (id: string, options: ConnectRequestOptions = {}) => operationRecord<Plan>(await read("plan", `plans/${id}.md`, options), `plans/${id}.md`),
    create: async (data: CreatePlanInput, options: ConnectRequestOptions = {}) => {
      const date = data.date || dateKey(new Date());
      const id = `${date}-${slugify(data.title)}`;
      const path = `plans/${id}.md`;
      const frontmatter = {
        ...data,
        date,
        status: "scheduled",
        exercises: data.exercises.map((item) => ({ ...item, exercise: wikilink("exercises", item.exercise) })),
      };
      return operationRecord<Plan>(await create("plan", { path, frontmatter }, options), path);
    },
    update: async (id: string, data: Partial<Plan>, options: ConnectRequestOptions = {}) => operationRecord<Plan>(await update("plan", `plans/${id}.md`, data, options), `plans/${id}.md`),
  },
  planTemplates: {
    list: async (options: ConnectRequestOptions = {}) => (await allTemplateRows(options)).map((row) => record<PlanTemplate>(row)),
    get: async (id: string, options: ConnectRequestOptions = {}) => operationRecord<PlanTemplate>(await read("plan-template", `plan-templates/${id}.md`, options), `plan-templates/${id}.md`),
    create: async (data: CreatePlanTemplateInput, options: ConnectRequestOptions = {}) => {
      const path = `plan-templates/${slugify(data.title)}.md`;
      const frontmatter = { ...data, exercises: data.exercises.map((item) => ({ ...item, exercise: wikilink("exercises", item.exercise) })) };
      return operationRecord<PlanTemplate>(await create("plan-template", { path, frontmatter }, options), path);
    },
    update: async (id: string, data: Partial<PlanTemplate>, options: ConnectRequestOptions = {}) => operationRecord<PlanTemplate>(await update("plan-template", `plan-templates/${id}.md`, data, options), `plan-templates/${id}.md`),
    delete: async (id: string, options: ConnectRequestOptions = {}) => { await remove("plan-template", `plan-templates/${id}.md`, options); return { ok: true }; },
  },
  stats: { get: stats, weekly: weeklyStats },
  today: async (timeZone?: string, options: ConnectRequestOptions = {}) => {
    const today = dateKey(new Date(), timeZone);
    const [planRows, sessionRows, quickLogRows, templateRows] = await Promise.all([
      rows("plan", { limit: 20000 }, options),
      rows("session", { limit: 20000 }, options),
      rows("quick-log", { limit: 20000 }, options),
      allTemplateRows(options),
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
    get: async (options: ConnectRequestOptions = {}) => {
      const description = unwrapConnectOutcome(
        await requireWorkoutConnection().describe(withTimeout(options, READ_TIMEOUT_MS)),
      );
      return {
        dataDir: requireWorkoutConnection().collectionId,
        configDataDir: "mdbase connect",
        collectionName: description.display_name,
      };
    },
    update: async () => { throw new Error("Collection folders are managed in mdbase connect."); },
  },
};
