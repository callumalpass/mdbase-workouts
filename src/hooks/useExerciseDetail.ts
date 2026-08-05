import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { ExerciseHistory } from "../lib/types";

export function useExerciseDetail(slug: string) {
  const [data, setData] = useState<ExerciseHistory | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    api.exercises.history(slug, { signal, timeoutMs: 15_000 }).then((d) => {
      if (signal?.aborted) return;
      setData(d);
      setLoading(false);
    }).catch(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, [slug]);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort("Exercise view changed");
  }, [refresh]);

  return { data, loading, refresh };
}
