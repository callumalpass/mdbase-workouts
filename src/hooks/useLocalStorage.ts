import { useState, useCallback } from "react";

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = v instanceof Function ? v(prev) : v;
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key]
  );

  return [value, set] as const;
}

/** Store and retrieve last-used weight/reps per exercise slug */
export function useLastUsed() {
  const [data, setData] = useLocalStorage<Record<string, { weight?: number; reps?: number }>>(
    "workout-last-used",
    {}
  );

  const getLastUsed = useCallback(
    (slug: string) => data[slug] || {},
    [data]
  );

  const saveLastUsed = useCallback(
    (slug: string, values: { weight?: number; reps?: number }) => {
      setData((prev) => ({ ...prev, [slug]: values }));
    },
    [setData]
  );

  return { getLastUsed, saveLastUsed };
}
