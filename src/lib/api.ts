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
    list: () => request<any[]>("/exercises"),
    get: (slug: string) => request<any>(`/exercises/${slug}`),
    history: (slug: string) => request<any>(`/exercises/${slug}/history`),
    create: (data: any) =>
      request<any>("/exercises", { method: "POST", body: JSON.stringify(data) }),
    update: (slug: string, data: any) =>
      request<any>(`/exercises/${slug}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  quickLogs: {
    list: (limit = 50) => request<any[]>(`/quick-logs?limit=${limit}`),
    create: (data: any) =>
      request<any>("/quick-logs", { method: "POST", body: JSON.stringify(data) }),
  },
  sessions: {
    list: (limit = 20, offset = 0) =>
      request<{ sessions: any[]; total: number; hasMore: boolean }>(
        `/sessions?limit=${limit}&offset=${offset}`
      ),
    get: (id: string) => request<any>(`/sessions/${id}`),
    create: (data: any) =>
      request<any>("/sessions", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/sessions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  plans: {
    list: (status?: string) =>
      request<any[]>(`/plans${status ? `?status=${status}` : ""}`),
    get: (id: string) => request<any>(`/plans/${id}`),
    create: (data: any) =>
      request<any>("/plans", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/plans/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  planTemplates: {
    list: () => request<any[]>("/plan-templates"),
    get: (id: string) => request<any>(`/plan-templates/${id}`),
    create: (data: any) =>
      request<any>("/plan-templates", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/plan-templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  today: () => request<any>("/today"),
  settings: {
    get: () =>
      request<{ dataDir: string; configDataDir: string }>("/settings"),
    update: (data: { dataDir: string }) =>
      request<{ dataDir: string; configDataDir: string }>("/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },
};
