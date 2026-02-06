import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { ExerciseHistory } from "../lib/types";

export function useExerciseDetail(slug: string) {
  const [data, setData] = useState<ExerciseHistory | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    api.exercises.history(slug).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [slug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, refresh };
}
