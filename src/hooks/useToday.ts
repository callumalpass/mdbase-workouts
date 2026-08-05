import { useCallback } from "react";
import { api } from "../lib/api";
import { getUserTimeZone, todayLocalDateKey } from "../lib/datetime";
import type { TodayData } from "../lib/types";
import { useCachedResource } from "./useCachedResource";

export function useToday() {
  const timeZone = getUserTimeZone();
  const load = useCallback((options: import("../lib/api").ApiRequestOptions) => api.today(timeZone, options), [timeZone]);

  return useCachedResource<TodayData>({
    cacheKey: `today:${timeZone}:${todayLocalDateKey()}`,
    load,
    errorMessage: "Failed to load today's data",
  });
}
