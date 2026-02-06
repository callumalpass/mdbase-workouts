import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { TodayData } from "../lib/types";

export function useToday() {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    api.today().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, refresh };
}
