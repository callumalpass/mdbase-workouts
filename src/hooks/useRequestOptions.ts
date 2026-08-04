import { useCallback, useEffect, useRef } from "react";
import type { ApiRequestOptions } from "../lib/api";

/** Owns one foreground request for a sheet or view and aborts it on close. */
export function useRequestOptions(timeoutMs = 20_000, active = true): () => ApiRequestOptions {
  const current = useRef<AbortController | null>(null);

  useEffect(() => () => current.current?.abort("Workout surface closed"), []);
  useEffect(() => {
    if (!active) current.current?.abort("Workout surface closed");
  }, [active]);

  return useCallback(() => {
    current.current?.abort("A newer workout action superseded this one");
    const controller = new AbortController();
    current.current = controller;
    return { signal: controller.signal, timeoutMs };
  }, [timeoutMs]);
}
