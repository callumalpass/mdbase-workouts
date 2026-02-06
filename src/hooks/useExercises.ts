import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api";
import type { Exercise } from "../lib/types";

export function useExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.exercises.list().then((data) => {
      setExercises(data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return exercises;
    const q = search.toLowerCase();
    return exercises.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.muscle_groups?.some((g) => g.toLowerCase().includes(q)) ||
        e.equipment?.toLowerCase().includes(q)
    );
  }, [exercises, search]);

  return { exercises: filtered, allExercises: exercises, loading, search, setSearch };
}
