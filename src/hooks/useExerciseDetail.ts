import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { subscribeToWorkoutData } from "../lib/connect-api";
import type { ExerciseHistory } from "../lib/types";

export function useExerciseDetail(slug: string) {
  const [data, setData] = useState<ExerciseHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    request.current?.abort("A newer exercise read superseded this one");
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    api.exercises.history(slug, { signal }).then((d) => {
      if (signal.aborted) return;
      setData(d);
      setLoading(false);
    }).catch(() => {
      if (!signal.aborted) setLoading(false);
    });
  }, [slug]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    refresh();
    // Records changed, on this device or another: read again in place.
    const stop = subscribeToWorkoutData(refresh);
    return () => {
      stop();
      request.current?.abort("Exercise view changed");
    };
  }, [refresh]);

  return { data, loading, refresh };
}
