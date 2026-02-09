import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { TodayData } from "../lib/types";
import { getUserTimeZone } from "../lib/datetime";

export function useToday() {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    api.today(getUserTimeZone())
      .then((d) => {
        setData(d);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to load today's data";
        setError(message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
