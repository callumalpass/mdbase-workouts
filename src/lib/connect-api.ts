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
import {
  toPlain,
  type ContractQueryResult,
  type ContractRecordView,
  type ContractSelector,
  type MdbaseClient,
  type PlainValue,
} from "@mdbase-dev/sdk";
import {
  rememberWorkoutPendingMutation,
  requireWorkoutConnection,
  runWorkoutMutation,
  type ConnectRequestOptions,
  type WorkoutConnection,
} from "./connect";
import { computeWorkoutStats, computeWorkoutWeeklyStats } from "./workout-stats";
import { clearWorkoutCache } from "./workout-cache";

interface QueryRow {
  path: string;
  frontmatter: Record<string, unknown>;
}
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
const QUERY_PAGE_SIZE = 128;
const MAX_SOURCE_ROWS = 100_000;
let cacheGeneration = 0;
interface SourceCacheEntry {
  collectionId: string;
  generation: number;
  savedAt?: number;
  value?: QueryRow[];
  pending?: Promise<QueryRow[]>;
  controller?: AbortController;
  subscribers?: number;
}
const sourceCache = new Map<string, SourceCacheEntry>();
const providerCache = new Map<string, string>();

function contract(type: WorkoutType, provider?: string): ContractSelector {
  return {
    id: CONTRACTS[type],
    version: CONTRACT_VERSION,
    ...(provider ? { type: provider } : {}),
  };
}

function plain(fields: Record<string, unknown> | Map<string, unknown>): Record<string, unknown> {
  return toPlain(fields as never) as Record<string, unknown>;
}

function plainInput(value: Record<string, unknown>): Record<string, PlainValue> {
  return value as Record<string, PlainValue>;
}

async function providerFor(
  type: WorkoutType,
  client: MdbaseClient,
  options: ConnectRequestOptions = {},
): Promise<string> {
  const key = `${client.collection}:${type}`;
  const cached = providerCache.get(key);
  if (cached) return cached;
  const provider = await discoverProvider(type, client, options);
  providerCache.set(key, provider);
  return provider;
}

async function discoverProvider(
  type: WorkoutType,
  client: MdbaseClient,
  options: ConnectRequestOptions = {},
): Promise<string> {
  const description = await client.describe(signalFor(options, READ_TIMEOUT_MS));
  const descriptor = description.contracts.find(
    (candidate) =>
      candidate.id === CONTRACTS[type] &&
      candidate.version === CONTRACT_VERSION,
  );
  if (!descriptor?.implementedBy.length) {
    // Replicas that do not describe contract implementations still resolve the
    // app's own default type by name; an absent contract is refused by the
    // replica's contract query.
    return type;
  }
  const providers = [...descriptor.implementedBy].sort((left, right) =>
    left.localeCompare(right),
  );
  return providers.find((provider) => provider === type) ?? providers[0];
}

async function read(
  type: WorkoutType,
  path: string,
  options: ConnectRequestOptions = {},
  connection = requireWorkoutConnection(),
): Promise<ContractRecordView> {
  return connection.records.getContract(
    { path },
    contract(type, await providerFor(type, connection.records, options)),
    signalFor(options, READ_TIMEOUT_MS),
  );
}

async function create(
  type: WorkoutType,
  input: { path: string; frontmatter: Record<string, unknown> },
  connection: WorkoutConnection,
  options: ConnectRequestOptions = {},
): Promise<ContractRecordView> {
  const provider = await providerFor(type, connection.records, options);
  try {
    const write = await connection.records.create({
      path: input.path,
      frontmatter: plainInput(input.frontmatter),
      contract: contract(type, provider),
    }, { signal: signalFor(options, WRITE_TIMEOUT_MS) });
    await write.confirmed;
    return await read(type, input.path, options, connection);
  } catch (error) {
    rememberWorkoutPendingMutation(error, connection);
    throw error;
  } finally {
    invalidateConnectApiCache();
  }
}

async function update(
  type: WorkoutType,
  path: string,
  patch: Record<string, unknown>,
  connection: WorkoutConnection,
  options: ConnectRequestOptions = {},
): Promise<ContractRecordView> {
  const current = await read(type, path, options, connection);
  const { path: _path, revision: _revision, ...frontmatterPatch } = patch;
  try {
    const write = await connection.records.update(
      { path },
      {
        patch: plainInput(frontmatterPatch),
        ifRevision: current.revision,
        contract: contract(type, await providerFor(type, connection.records, options)),
      },
      { signal: signalFor(options, WRITE_TIMEOUT_MS) },
    );
    await write.confirmed;
    return await read(type, path, options, connection);
  } catch (error) {
    rememberWorkoutPendingMutation(error, connection);
    throw error;
  } finally {
    invalidateConnectApiCache();
  }
}

async function remove(
  type: WorkoutType,
  path: string,
  connection: WorkoutConnection,
  options: ConnectRequestOptions = {},
): Promise<void> {
  const current = await read(type, path, options, connection);
  try {
    const write = await connection.records.delete(
      { path },
      {
        ifRevision: current.revision,
        contract: contract(type, await providerFor(type, connection.records, options)),
        signal: signalFor(options, WRITE_TIMEOUT_MS),
      },
    );
    await write.confirmed;
  } catch (error) {
    rememberWorkoutPendingMutation(error, connection);
    throw error;
  } finally {
    invalidateConnectApiCache();
  }
}

export function invalidateConnectApiCache(): void {
  cacheGeneration += 1;
  sourceCache.clear();
  providerCache.clear();
  clearWorkoutCache();
}

function record<T>(row: QueryRow): T {
  return { path: row.path, ...row.frontmatter } as T;
}

function operationRecord<T>(value: ContractRecordView, fallbackPath: string): T {
  return {
    ...plain(value.fields),
    path: String(value.path ?? fallbackPath),
    revision: value.revision,
  } as T;
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
  _extra: Record<string, never> = {},
  options: ConnectRequestOptions = {},
): Promise<QueryRow[]> {
  const connection = requireWorkoutConnection();
  const collectionId = connection.collectionId;
  const key = `${type}:`;
  const cached = sourceCache.get(key);
  if (cached?.collectionId === collectionId) {
    if (cached.value && cached.savedAt && Date.now() - cached.savedAt < SOURCE_FRESH_MS) {
      return cached.value;
    }
    if (cached.pending) return awaitSharedRows(cached, options.signal);
  }

  const generation = cacheGeneration;
  const { signal, ...sharedOptions } = options;
  const controller = new AbortController();
  const entry: SourceCacheEntry = {
    collectionId,
    generation,
    controller,
    subscribers: 0,
  };
  const pending = (async () => {
    const provider = await providerFor(type, connection.records, sharedOptions);
    return collectQueryPages(type, provider, {
      ...sharedOptions,
      signal: controller.signal,
    });
  })()
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
  entry.pending = pending;
  sourceCache.set(key, entry);
  return awaitSharedRows(entry, signal);
}

async function awaitSharedRows(
  entry: SourceCacheEntry,
  signal?: AbortSignal,
): Promise<QueryRow[]> {
  if (!entry.pending) throw new Error("Workout source scan is not pending.");
  entry.subscribers = (entry.subscribers ?? 0) + 1;
  try {
    return await awaitWithSignal(entry.pending, signal);
  } finally {
    entry.subscribers = Math.max(0, (entry.subscribers ?? 1) - 1);
    if (entry.subscribers === 0 && !entry.value) {
      entry.controller?.abort(new DOMException("Workout source scan has no callers", "AbortError"));
    }
  }
}

async function collectQueryPages(
  type: WorkoutType,
  provider: string,
  options: ConnectRequestOptions,
): Promise<QueryRow[]> {
  const rows: QueryRow[] = [];
  const client = requireWorkoutConnection().records;
  let cursor: string | undefined;
  for (;;) {
    const page: ContractQueryResult = await client.queryContract(
      contract(type),
      {
        pageSize: QUERY_PAGE_SIZE,
        cursor,
        signal: signalFor(options, options.timeoutMs ?? READ_TIMEOUT_MS),
      },
    );
    const paths = new Map(page.page.records.map((record) => [record.id, record.path]));
    for (const entry of page.records) {
      const projection = entry.implementations.find((candidate) => candidate.typeName === provider)
        ?? entry.implementations.find((candidate) => candidate.typeName === type)
        ?? entry.implementations[0];
      if (!projection) continue;
      rows.push({
        path: paths.get(entry.id) ?? "",
        frontmatter: plain(projection.fields),
      });
      if (rows.length > MAX_SOURCE_ROWS) {
        throw new Error(
          `Workout ${type} query exceeded the ${MAX_SOURCE_ROWS.toLocaleString()}-record client budget.`,
        );
      }
    }
    cursor = page.page.cursor;
    if (!cursor) break;
  }
  return rows;
}

const allExerciseRows = async (options: ConnectRequestOptions = {}) =>
  [...(await rows("exercise", {}, options))].sort((left, right) =>
    String(left.frontmatter?.name ?? "").localeCompare(
      String(right.frontmatter?.name ?? ""),
    ),
  );
const allSessionRows = async (options: ConnectRequestOptions = {}) =>
  [...(await rows("session", {}, options))].sort((left, right) =>
    String(right.frontmatter?.date ?? "").localeCompare(
      String(left.frontmatter?.date ?? ""),
    ),
  );
const allQuickLogRows = async (options: ConnectRequestOptions = {}) =>
  [...(await rows("quick-log", {}, options))].sort((left, right) =>
    String(right.frontmatter?.logged_at ?? "").localeCompare(
      String(left.frontmatter?.logged_at ?? ""),
    ),
  );
const allTemplateRows = (options: ConnectRequestOptions = {}) => rows("plan-template", {}, options);

function signalFor(
  options: ConnectRequestOptions,
  timeoutMs: number,
): AbortSignal | undefined {
  const timeout = options.timeoutMs ?? timeoutMs;
  const timeoutSignal = timeout === undefined ? undefined : AbortSignal.timeout(timeout);
  if (options.signal && timeoutSignal) return AbortSignal.any([options.signal, timeoutSignal]);
  return options.signal ?? timeoutSignal;
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
    create: (data: CreateExerciseInput, options: ConnectRequestOptions = {}) => runWorkoutMutation(async (connection) => {
      const path = `exercises/${slugify(data.name)}.md`;
      return operationRecord<Exercise>(await create("exercise", { path, frontmatter: { ...data } }, connection, options), path);
    }),
    update: (slug: string, data: Partial<CreateExerciseInput>, options: ConnectRequestOptions = {}) => runWorkoutMutation(async (connection) => operationRecord<Exercise>(await update("exercise", `exercises/${slug}.md`, data, connection, options), `exercises/${slug}.md`)),
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
    create: (data: CreateQuickLogInput, options: ConnectRequestOptions = {}) => runWorkoutMutation(async (connection) => {
      const now = new Date();
      const path = `quick-logs/${timestamp(now)}.md`;
      const frontmatter = { ...data, exercise: wikilink("exercises", data.exercise), logged_at: now.toISOString() };
      return operationRecord<QuickLog>(await create("quick-log", { path, frontmatter }, connection, options), path);
    }),
  },
  sessions: {
    list: async (limit = 20, offset = 0, options: ConnectRequestOptions = {}) => {
      const all = await allSessionRows(options);
      const sessions = all.slice(offset, offset + limit).map((row) => record<Session>(row));
      return { sessions, total: all.length, hasMore: offset + sessions.length < all.length };
    },
    get: async (id: string, options: ConnectRequestOptions = {}) => operationRecord<Session>(await read("session", `sessions/${id}.md`, options), `sessions/${id}.md`),
    create: (data: CreateSessionInput, options: ConnectRequestOptions = {}) => runWorkoutMutation(async (connection) => {
      const now = new Date();
      const id = timestamp(now);
      const path = `sessions/${id}.md`;
      const frontmatter: Record<string, unknown> = {
        ...data,
        date: data.date || now.toISOString(),
        exercises: data.exercises.map((item) => ({ ...item, exercise: wikilink("exercises", item.exercise) })),
        ...(data.plan ? { plan: wikilink("plans", data.plan) } : {}),
      };
      const session = operationRecord<Session>(await create("session", { path, frontmatter }, connection, options), path);
      if (data.plan) await update("plan", `plans/${data.plan}.md`, { status: "completed", session: wikilink("sessions", id) }, connection, options);
      return session;
    }),
    update: (id: string, data: Partial<Session>, options: ConnectRequestOptions = {}) => runWorkoutMutation(async (connection) => operationRecord<Session>(await update("session", `sessions/${id}.md`, data, connection, options), `sessions/${id}.md`)),
    delete: (id: string, options: ConnectRequestOptions = {}) => runWorkoutMutation(async (connection) => { await remove("session", `sessions/${id}.md`, connection, options); return { ok: true }; }),
  },
  plans: {
    list: async (status?: string, options: ConnectRequestOptions = {}) => {
      const plans = [...(await rows("plan", {}, options))]
        .map((row) => record<Plan>(row))
        .filter((plan) => !status || plan.status === status);
      return plans.sort((left, right) => right.date.localeCompare(left.date));
    },
    get: async (id: string, options: ConnectRequestOptions = {}) => operationRecord<Plan>(await read("plan", `plans/${id}.md`, options), `plans/${id}.md`),
    create: (data: CreatePlanInput, options: ConnectRequestOptions = {}) => runWorkoutMutation(async (connection) => {
      const date = data.date || dateKey(new Date());
      const id = `${date}-${slugify(data.title)}`;
      const path = `plans/${id}.md`;
      const frontmatter = {
        ...data,
        date,
        status: "scheduled",
        exercises: data.exercises.map((item) => ({ ...item, exercise: wikilink("exercises", item.exercise) })),
      };
      return operationRecord<Plan>(await create("plan", { path, frontmatter }, connection, options), path);
    }),
    update: (id: string, data: Partial<Plan>, options: ConnectRequestOptions = {}) => runWorkoutMutation(async (connection) => operationRecord<Plan>(await update("plan", `plans/${id}.md`, data, connection, options), `plans/${id}.md`)),
  },
  planTemplates: {
    list: async (options: ConnectRequestOptions = {}) => (await allTemplateRows(options)).map((row) => record<PlanTemplate>(row)),
    get: async (id: string, options: ConnectRequestOptions = {}) => operationRecord<PlanTemplate>(await read("plan-template", `plan-templates/${id}.md`, options), `plan-templates/${id}.md`),
    create: (data: CreatePlanTemplateInput, options: ConnectRequestOptions = {}) => runWorkoutMutation(async (connection) => {
      const path = `plan-templates/${slugify(data.title)}.md`;
      const frontmatter = { ...data, exercises: data.exercises.map((item) => ({ ...item, exercise: wikilink("exercises", item.exercise) })) };
      return operationRecord<PlanTemplate>(await create("plan-template", { path, frontmatter }, connection, options), path);
    }),
    update: (id: string, data: Partial<PlanTemplate>, options: ConnectRequestOptions = {}) => runWorkoutMutation(async (connection) => operationRecord<PlanTemplate>(await update("plan-template", `plan-templates/${id}.md`, data, connection, options), `plan-templates/${id}.md`)),
    delete: (id: string, options: ConnectRequestOptions = {}) => runWorkoutMutation(async (connection) => { await remove("plan-template", `plan-templates/${id}.md`, connection, options); return { ok: true }; }),
  },
  stats: { get: stats, weekly: weeklyStats },
  today: async (timeZone?: string, options: ConnectRequestOptions = {}) => {
    const today = dateKey(new Date(), timeZone);
    const [planRows, sessionRows, quickLogRows, templateRows] = await Promise.all([
      rows("plan", {}, options),
      rows("session", {}, options),
      rows("quick-log", {}, options),
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
      const connection = requireWorkoutConnection();
      await connection.records.describe(signalFor(options, READ_TIMEOUT_MS));
      return {
        dataDir: connection.collectionId,
        configDataDir: "mdbase connect",
        collectionName: connection.displayName,
      };
    },
    update: async () => { throw new Error("Collection folders are managed in mdbase connect."); },
  },
};
