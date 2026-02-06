import { describe, expect, it } from "vitest";
import { parseJsonString, parseSseEvents } from "./chatStream";

describe("parseSseEvents", () => {
  it("parses complete event blocks and keeps incomplete remainder", () => {
    const input =
      'event: text\ndata: "Hello"\n\n' +
      "event: session\ndata: {\"sessionId\":\"abc\"}\n\n" +
      'event: text\ndata: "incomplete';

    const parsed = parseSseEvents(input);

    expect(parsed.events).toEqual([
      { event: "text", data: '"Hello"' },
      { event: "session", data: '{"sessionId":"abc"}' },
    ]);
    expect(parsed.remainder).toBe('event: text\ndata: "incomplete');
  });
});

describe("parseJsonString", () => {
  it("decodes JSON encoded strings and falls back to raw text", () => {
    expect(parseJsonString('"Hello world"')).toBe("Hello world");
    expect(parseJsonString("plain text")).toBe("plain text");
  });
});

