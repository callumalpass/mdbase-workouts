export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function expectRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ValidationError(message);
  }
  return value;
}

export function asOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new ValidationError("Expected a string value");
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function asRequiredString(value: unknown, field: string): string {
  const str = asOptionalString(value);
  if (!str) throw new ValidationError(`${field} is required`);
  return str;
}

export function asOptionalNumber(value: unknown, field: string): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ValidationError(`${field} must be a valid number`);
  }
  return value;
}

export function asOptionalInteger(value: unknown, field: string): number | undefined {
  const num = asOptionalNumber(value, field);
  if (num == null) return undefined;
  if (!Number.isInteger(num)) throw new ValidationError(`${field} must be an integer`);
  return num;
}

export function parsePositiveIntQuery(
  value: string | undefined,
  fallback: number,
  max: number
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export function asSlug(value: string, field: string): string {
  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new ValidationError(`${field} must be a valid slug`);
  }
  return value;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
