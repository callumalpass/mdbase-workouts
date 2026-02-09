import { describe, expect, it } from "vitest";
import { dateKeyInTimeZone, resolveTimeZone } from "./timezone";

describe("timezone helpers", () => {
  it("formats date keys in a provided timezone", () => {
    const utcInstant = "2026-02-08T19:00:00.000Z";
    expect(dateKeyInTimeZone(utcInstant, "Australia/Melbourne")).toBe("2026-02-09");
    expect(dateKeyInTimeZone(utcInstant, "UTC")).toBe("2026-02-08");
  });

  it("falls back invalid or missing timezone values to UTC", () => {
    expect(resolveTimeZone("Australia/Melbourne")).toBe("Australia/Melbourne");
    expect(resolveTimeZone("not-a-real-timezone")).toBe("UTC");
    expect(resolveTimeZone()).toBe("UTC");
  });
});
