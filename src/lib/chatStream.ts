export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Parse complete SSE blocks from a chunk buffer and return leftover data.
 */
export function parseSseEvents(
  buffer: string
): { events: SseEvent[]; remainder: string } {
  const events: SseEvent[] = [];
  let cursor = 0;

  while (true) {
    const boundary = buffer.indexOf("\n\n", cursor);
    if (boundary === -1) break;

    const block = buffer.slice(cursor, boundary);
    cursor = boundary + 2;

    let event = "";
    const dataLines: string[] = [];

    for (const rawLine of block.split("\n")) {
      const line = rawLine.trimEnd();
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    events.push({ event, data: dataLines.join("\n") });
  }

  return { events, remainder: buffer.slice(cursor) };
}

export function parseJsonString(value: string): string {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : String(parsed);
  } catch {
    return value;
  }
}

