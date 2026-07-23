import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Session, SessionListResponse } from "../lib/types";
import { useCachedResource } from "./useCachedResource";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const loadFirstPage = useCallback(() => api.sessions.list(20, 0), []);
  const { data, loading, refresh: refreshFirstPage } = useCachedResource<SessionListResponse>({
    cacheKey: "sessions:first-page",
    load: loadFirstPage,
    errorMessage: "Failed to load workout history",
  });

  useEffect(() => {
    if (!data) return;
    setSessions(data.sessions);
    setTotal(data.total);
    setHasMore(data.hasMore);
  }, [data]);

  const loadMore = useCallback(async () => {
    const offset = sessions.length;
    const res = await api.sessions.list(20, offset);
    setSessions((previous) => [...previous, ...res.sessions]);
    setTotal(res.total);
    setHasMore(res.hasMore);
  }, [sessions.length]);

  const refresh = useCallback(async () => {
    const res = await refreshFirstPage();
    if (!res) return;
    setSessions(res.sessions);
    setTotal(res.total);
    setHasMore(res.hasMore);
  }, [refreshFirstPage]);

  return { sessions, loading, hasMore, total, loadMore, refresh };
}
