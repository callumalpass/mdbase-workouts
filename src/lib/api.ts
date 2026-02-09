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
} from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  exercises: {
    list: () => request<Exercise[]>("/exercises"),
    get: (slug: string) => request<Exercise>(`/exercises/${slug}`),
    history: (slug: string) => request<ExerciseHistory>(`/exercises/${slug}/history`),
    create: (data: CreateExerciseInput) =>
      request<Exercise>("/exercises", { method: "POST", body: JSON.stringify(data) }),
    update: (slug: string, data: Partial<CreateExerciseInput>) =>
      request<Exercise>(`/exercises/${slug}`, { method: "PUT", body: JSON.stringify(data) }),
    lastSets: (slugs: string[]) =>
      request<LastSetsResponse>("/exercises/last-sets", {
        method: "POST",
        body: JSON.stringify({ slugs }),
      }),
  },
  quickLogs: {
    list: (limit = 50) => request<QuickLog[]>(`/quick-logs?limit=${limit}`),
    create: (data: CreateQuickLogInput) =>
      request<QuickLog>("/quick-logs", { method: "POST", body: JSON.stringify(data) }),
  },
  sessions: {
    list: (limit = 20, offset = 0) =>
      request<SessionListResponse>(
        `/sessions?limit=${limit}&offset=${offset}`
      ),
    get: (id: string) => request<Session>(`/sessions/${id}`),
    create: (data: CreateSessionInput) =>
      request<Session>("/sessions", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Session>) =>
      request<Session>(`/sessions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/sessions/${id}`, { method: "DELETE" }),
  },
  plans: {
    list: (status?: string) =>
      request<Plan[]>(`/plans${status ? `?status=${status}` : ""}`),
    get: (id: string) => request<Plan>(`/plans/${id}`),
    create: (data: CreatePlanInput) =>
      request<Plan>("/plans", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Plan>) =>
      request<Plan>(`/plans/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  planTemplates: {
    list: () => request<PlanTemplate[]>("/plan-templates"),
    get: (id: string) => request<PlanTemplate>(`/plan-templates/${id}`),
    create: (data: CreatePlanTemplateInput) =>
      request<PlanTemplate>("/plan-templates", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<PlanTemplate>) =>
      request<PlanTemplate>(`/plan-templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/plan-templates/${id}`, { method: "DELETE" }),
  },
  stats: {
    get: (timezone?: string) =>
      request<StatsResponse>(`/stats${timezone ? `?timezone=${encodeURIComponent(timezone)}` : ""}`),
  },
  today: (timezone?: string) =>
    request<TodayData>(`/today${timezone ? `?timezone=${encodeURIComponent(timezone)}` : ""}`),
  settings: {
    get: () =>
      request<SettingsResponse>("/settings"),
    update: (data: { dataDir: string }) =>
      request<SettingsResponse>("/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },
};
