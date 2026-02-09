const DATE_KEY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getDateKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = DATE_KEY_FORMATTER_CACHE.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  DATE_KEY_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    getDateKeyFormatter(timeZone).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(timeZone?: string | null): string {
  if (!timeZone) return "UTC";
  return isValidTimeZone(timeZone) ? timeZone : "UTC";
}

export function dateKeyInTimeZone(value: string | Date, timeZone: string): string | null {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;

  const parts = getDateKeyFormatter(timeZone).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}
