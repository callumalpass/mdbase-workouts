import { connectionInfo } from "./connect";

const CACHE_PREFIX = "mdbase-workouts:cache:v1:";
const MAX_ENTRY_BYTES = 350_000;
const MAX_ENTRY_AGE_MS = 14 * 24 * 60 * 60 * 1_000;

interface StoredCacheEntry<T> {
  savedAt: number;
  value: T;
}

export interface WorkoutCacheEntry<T> extends StoredCacheEntry<T> {}

const inFlight = new Map<string, Promise<unknown>>();
const generations = new Map<string, number>();

function scope(collectionId = connectionInfo()?.collectionId ?? "local"): string {
  return encodeURIComponent(collectionId);
}

function cachePrefix(collectionId?: string): string {
  return `${CACHE_PREFIX}${scope(collectionId)}:`;
}

function storageKey(key: string, collectionId?: string): string {
  return `${cachePrefix(collectionId)}${key}`;
}

function store<T>(fullKey: string, value: T): void {
  try {
    const serialized = JSON.stringify({ savedAt: Date.now(), value } satisfies StoredCacheEntry<T>);
    if (serialized.length > MAX_ENTRY_BYTES) return;
    localStorage.setItem(fullKey, serialized);
  } catch {
    // A cache miss is always safe. Storage can be unavailable or full.
  }
}

export function readWorkoutCache<T>(key: string): WorkoutCacheEntry<T> | null {
  const fullKey = storageKey(key);
  try {
    const raw = localStorage.getItem(fullKey);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<StoredCacheEntry<T>>;
    if (typeof entry.savedAt !== "number" || !("value" in entry)) {
      localStorage.removeItem(fullKey);
      return null;
    }
    if (Date.now() - entry.savedAt > MAX_ENTRY_AGE_MS) {
      localStorage.removeItem(fullKey);
      return null;
    }
    return entry as WorkoutCacheEntry<T>;
  } catch {
    localStorage.removeItem(fullKey);
    return null;
  }
}

export function writeWorkoutCache<T>(key: string, value: T): void {
  store(storageKey(key), value);
}

export async function loadWorkoutCache<T>(key: string, load: () => Promise<T>): Promise<T> {
  const prefix = cachePrefix();
  const fullKey = `${prefix}${key}`;
  const generation = generations.get(prefix) ?? 0;
  const pending = inFlight.get(fullKey) as Promise<T> | undefined;
  if (pending) return pending;

  const request = load()
    .then((value) => {
      if ((generations.get(prefix) ?? 0) === generation) store(fullKey, value);
      return value;
    })
    .finally(() => {
      if (inFlight.get(fullKey) === request) inFlight.delete(fullKey);
    });
  inFlight.set(fullKey, request);
  return request;
}

export function clearWorkoutCache(collectionId?: string): void {
  const prefix = cachePrefix(collectionId);
  generations.set(prefix, (generations.get(prefix) ?? 0) + 1);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix)) localStorage.removeItem(key);
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix)) inFlight.delete(key);
  }
}
