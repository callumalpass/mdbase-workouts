import { useCallback, useEffect, useRef, useState } from "react";
import { loadWorkoutCache, readWorkoutCache } from "../lib/workout-cache";

const DEFAULT_FRESH_MS = 30_000;

interface CachedResourceOptions<T> {
  cacheKey: string;
  load: () => Promise<T>;
  errorMessage: string;
  freshForMs?: number;
}

export function useCachedResource<T>({
  cacheKey,
  load,
  errorMessage,
  freshForMs = DEFAULT_FRESH_MS,
}: CachedResourceOptions<T>) {
  const initial = useRef(readWorkoutCache<T>(cacheKey));
  const [data, setData] = useState<T | null>(() => initial.current?.value ?? null);
  const [loading, setLoading] = useState(() => initial.current === null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const run = useCallback(async (force: boolean) => {
    const currentGeneration = ++generation.current;
    const cached = readWorkoutCache<T>(cacheKey);
    if (!force && cached && Date.now() - cached.savedAt < freshForMs) {
      setData(cached.value);
      setLoading(false);
      setError(null);
      return cached.value;
    }

    if (!cached) setLoading(true);
    setError(null);
    try {
      const value = await loadWorkoutCache(cacheKey, load);
      if (currentGeneration === generation.current) {
        setData(value);
        setError(null);
      }
      return value;
    } catch (reason) {
      if (currentGeneration === generation.current && !cached) {
        setError(reason instanceof Error ? reason.message : errorMessage);
      }
      return null;
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  }, [cacheKey, errorMessage, freshForMs, load]);

  useEffect(() => {
    const cached = readWorkoutCache<T>(cacheKey);
    initial.current = cached;
    setData(cached?.value ?? null);
    setLoading(cached === null);
    setError(null);
    void run(false);
    return () => {
      generation.current += 1;
    };
  }, [cacheKey, run]);

  const refresh = useCallback(() => run(true), [run]);

  return { data, loading, error, refresh };
}
