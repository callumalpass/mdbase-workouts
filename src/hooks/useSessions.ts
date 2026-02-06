import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { Session } from "../lib/types";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const loadMore = useCallback(async () => {
    const offset = sessions.length;
    const res = await api.sessions.list(20, offset);
    setSessions((prev) => [...prev, ...res.sessions]);
    setTotal(res.total);
    setHasMore(res.hasMore);
  }, [sessions.length]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await api.sessions.list(20, 0);
    setSessions(res.sessions);
    setTotal(res.total);
    setHasMore(res.hasMore);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessions, loading, hasMore, total, loadMore, refresh };
}
