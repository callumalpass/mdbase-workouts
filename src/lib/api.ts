import type {
  CreateExerciseInput,
  CreatePlanInput,
  CreatePlanTemplateInput,
  CreateQuickLogInput,
  CreateSessionInput,
  Exercise,
  ExerciseHistory,
  LastSetsResponse,
  Plan,
  PlanTemplate,
  QuickLog,
  Session,
  SessionListResponse,
  SettingsResponse,
  StatsResponse,
  TodayData,
  WeeklyStatsResponse,
} from "./types";
import { workoutSnapshot } from "./connect";
import { connectApi } from "./connect-api";
import { clearWorkoutCache } from "./workout-cache";

const BASE = "/api";

export interface ApiRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number | null;
}

async function request<T>(path: string, init?: RequestInit, options: ApiRequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = options.timeoutMs == null
    ? undefined
    : window.setTimeout(
      () => controller.abort(new DOMException(`Workout request timed out after ${options.timeoutMs}ms`, "TimeoutError")),
      options.timeoutMs,
    );
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    const value = await res.json();
    if (init?.method && init.method !== "GET") clearWorkoutCache();
    return value;
  } finally {
    options.signal?.removeEventListener("abort", abort);
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

const localApi = {
  exercises: {
    list: (options: ApiRequestOptions = {}) => request<Exercise[]>("/exercises", undefined, options),
    get: (slug: string, options: ApiRequestOptions = {}) => request<Exercise>(`/exercises/${slug}`, undefined, options),
    history: (slug: string, options: ApiRequestOptions = {}) => request<ExerciseHistory>(`/exercises/${slug}/history`, undefined, options),
    create: (data: CreateExerciseInput, options: ApiRequestOptions = {}) =>
      request<Exercise>("/exercises", { method: "POST", body: JSON.stringify(data) }, options),
    update: (slug: string, data: Partial<CreateExerciseInput>, options: ApiRequestOptions = {}) =>
      request<Exercise>(`/exercises/${slug}`, { method: "PUT", body: JSON.stringify(data) }, options),
    lastSets: (slugs: string[], options: ApiRequestOptions = {}) =>
      request<LastSetsResponse>("/exercises/last-sets", {
        method: "POST",
        body: JSON.stringify({ slugs }),
      }, options),
  },
  quickLogs: {
    list: (limit = 50, options: ApiRequestOptions = {}) => request<QuickLog[]>(`/quick-logs?limit=${limit}`, undefined, options),
    create: (data: CreateQuickLogInput, options: ApiRequestOptions = {}) =>
      request<QuickLog>("/quick-logs", { method: "POST", body: JSON.stringify(data) }, options),
  },
  sessions: {
    list: (limit = 20, offset = 0, options: ApiRequestOptions = {}) =>
      request<SessionListResponse>(
        `/sessions?limit=${limit}&offset=${offset}`,
        undefined,
        options,
      ),
    get: (id: string, options: ApiRequestOptions = {}) => request<Session>(`/sessions/${id}`, undefined, options),
    create: (data: CreateSessionInput, options: ApiRequestOptions = {}) =>
      request<Session>("/sessions", { method: "POST", body: JSON.stringify(data) }, options),
    update: (id: string, data: Partial<Session>, options: ApiRequestOptions = {}) =>
      request<Session>(`/sessions/${id}`, { method: "PUT", body: JSON.stringify(data) }, options),
    delete: (id: string, options: ApiRequestOptions = {}) =>
      request<{ ok: boolean }>(`/sessions/${id}`, { method: "DELETE" }, options),
  },
  plans: {
    list: (status?: string, options: ApiRequestOptions = {}) =>
      request<Plan[]>(`/plans${status ? `?status=${status}` : ""}`, undefined, options),
    get: (id: string, options: ApiRequestOptions = {}) => request<Plan>(`/plans/${id}`, undefined, options),
    create: (data: CreatePlanInput, options: ApiRequestOptions = {}) =>
      request<Plan>("/plans", { method: "POST", body: JSON.stringify(data) }, options),
    update: (id: string, data: Partial<Plan>, options: ApiRequestOptions = {}) =>
      request<Plan>(`/plans/${id}`, { method: "PUT", body: JSON.stringify(data) }, options),
  },
  planTemplates: {
    list: (options: ApiRequestOptions = {}) => request<PlanTemplate[]>("/plan-templates", undefined, options),
    get: (id: string, options: ApiRequestOptions = {}) => request<PlanTemplate>(`/plan-templates/${id}`, undefined, options),
    create: (data: CreatePlanTemplateInput, options: ApiRequestOptions = {}) =>
      request<PlanTemplate>("/plan-templates", { method: "POST", body: JSON.stringify(data) }, options),
    update: (id: string, data: Partial<PlanTemplate>, options: ApiRequestOptions = {}) =>
      request<PlanTemplate>(`/plan-templates/${id}`, { method: "PUT", body: JSON.stringify(data) }, options),
    delete: (id: string, options: ApiRequestOptions = {}) =>
      request<{ ok: boolean }>(`/plan-templates/${id}`, { method: "DELETE" }, options),
  },
  stats: {
    get: (timezone?: string, options: ApiRequestOptions = {}) =>
      request<StatsResponse>(`/stats${timezone ? `?timezone=${encodeURIComponent(timezone)}` : ""}`, undefined, options),
    weekly: (timezone?: string, options: ApiRequestOptions = {}) =>
      request<WeeklyStatsResponse>(`/stats/weekly${timezone ? `?timezone=${encodeURIComponent(timezone)}` : ""}`, undefined, options),
  },
  today: (timezone?: string, options: ApiRequestOptions = {}) =>
    request<TodayData>(`/today${timezone ? `?timezone=${encodeURIComponent(timezone)}` : ""}`, undefined, options),
  settings: {
    get: (options: ApiRequestOptions = {}) =>
      request<SettingsResponse>("/settings", undefined, options),
    update: (data: { dataDir: string }, options: ApiRequestOptions = {}) =>
      request<SettingsResponse>("/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      }, options),
  },
};

export const api = new Proxy(localApi, {
  get(target, property, receiver) {
    const backend = workoutSnapshot().status === "ready" ? connectApi : target;
    return Reflect.get(backend, property, receiver);
  },
}) as typeof localApi;
