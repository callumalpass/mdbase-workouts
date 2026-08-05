import { useCallback, useEffect, useRef, useState } from "react";
import { loadWorkoutCache, readWorkoutCache } from "../lib/workout-cache";
import type { ApiRequestOptions } from "../lib/api";

const DEFAULT_FRESH_MS = 30_000;

interface CachedResourceOptions<T> {
  cacheKey: string;
  load: (options: ApiRequestOptions) => Promise<T>;
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
  const request = useRef<AbortController | null>(null);

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
    request.current?.abort("A newer workout request superseded this one");
    const controller = new AbortController();
    request.current = controller;
    try {
      const pending = loadWorkoutCache(cacheKey, () => load({
        timeoutMs: force ? 10_000 : 15_000,
      }));
      const value = await awaitWithSignal(pending, controller.signal);
      if (currentGeneration === generation.current) {
        setData(value);
        setError(null);
      }
      return value;
    } catch (reason) {
      if (currentGeneration === generation.current && !cached && !controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : errorMessage);
      }
      return null;
    } finally {
      if (request.current === controller) request.current = null;
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
      request.current?.abort("Workout view closed");
      request.current = null;
    };
  }, [cacheKey, run]);

  const refresh = useCallback(() => run(true), [run]);

  return { data, loading, error, refresh };
}

function awaitWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError(signal));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Workout request aborted", "AbortError");
}
