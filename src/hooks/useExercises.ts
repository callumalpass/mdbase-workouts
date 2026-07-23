import { useCallback, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Exercise } from "../lib/types";
import { useCachedResource } from "./useCachedResource";

export function useExercises() {
  const [search, setSearch] = useState("");
  const load = useCallback(() => api.exercises.list(), []);
  const { data, loading } = useCachedResource<Exercise[]>({
    cacheKey: "exercises",
    load,
    errorMessage: "Failed to load exercises",
  });
  const exercises = data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return exercises;
    const q = search.toLowerCase();
    return exercises.filter(
      (exercise) =>
        exercise.name.toLowerCase().includes(q) ||
        exercise.muscle_groups?.some((group) => group.toLowerCase().includes(q)) ||
        exercise.equipment?.toLowerCase().includes(q)
    );
  }, [exercises, search]);

  return { exercises: filtered, allExercises: exercises, loading, search, setSearch };
}
