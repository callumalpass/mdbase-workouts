import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getDataDir } from "../lib/db.js";

const chat = new Hono();

const SYSTEM_PROMPT = `You are a helpful workout tracking assistant. You have access to a workout data collection stored as markdown files with YAML frontmatter, managed by mdbase.

## Data Structure

The collection is in the current working directory with these types:

### exercises/ (type: exercise)
Fields: name (string, required), muscle_groups (list), equipment (enum: barbell/dumbbell/bodyweight/cable/machine/kettlebell/band/none), tracking (enum: weight_reps/reps_only/timed/distance)

### sessions/ (type: session)
Fields: date (datetime, required), exercises (list of {exercise: wikilink, sets: [{reps, weight, duration_seconds, distance, notes}]}), duration_minutes, plan (link), rating (1-5), notes

### plans/ (type: plan)
Fields: date (date, required), title (string, required), exercises (list of {exercise: wikilink, target_sets, target_reps, target_weight, notes}), status (scheduled/completed/skipped), session (link), notes

### quick-logs/ (type: quick-log)
Fields: exercise (link, required), reps, weight, duration_seconds, distance, logged_at, notes

## Wikilinks
Cross-references use wikilinks: [[exercises/bench-press]] links to exercises/bench-press.md

## Type definitions
Type definitions live in _types/*.md. Each uses match.path_glob (e.g. path_glob: "plans/**") to bind types to folders. NEVER use match.folder — it is not a valid mdbase field and will be silently ignored.

## Guidelines
- When asked about exercises, read from exercises/ directory
- When creating plans, write valid frontmatter with type: plan
- When analysing history, read from sessions/ and quick-logs/
- Keep responses concise and helpful
- Use metric units (kg, km) by default`;

chat.post("/message", async (c) => {
  const body = await c.req.json();
  const { message, sessionId } = body;

  return streamSSE(c, async (stream) => {
    try {
      const options: Record<string, any> = {
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        cwd: getDataDir(),
        systemPrompt: SYSTEM_PROMPT,
        model: "sonnet",
        maxTurns: 10,
        includePartialMessages: true,
      };

      if (sessionId) {
        options.resume = sessionId;
      }

      // Use streaming input mode (async generator) for proper multi-turn
      async function* userMessages() {
        yield {
          type: "user" as const,
          message: { role: "user" as const, content: message },
        };
      }

      let currentToolName: string | null = null;

      for await (const msg of query({ prompt: userMessages(), options })) {
        if (msg.type === "system" && msg.subtype === "init") {
          await stream.writeSSE({
            event: "session",
            data: JSON.stringify({ sessionId: msg.session_id }),
          });
        }

        // Stream text and tool events from partial messages
        if (msg.type === "stream_event") {
          const evt = msg.event;

          // Text delta — stream it immediately
          if (
            evt.type === "content_block_delta" &&
            evt.delta.type === "text_delta"
          ) {
            await stream.writeSSE({
              event: "text",
              data: JSON.stringify(evt.delta.text),
            });
          }

          // Tool use started
          if (
            evt.type === "content_block_start" &&
            evt.content_block.type === "tool_use"
          ) {
            currentToolName = evt.content_block.name;
          }

          // Tool input arriving — capture file path for display
          if (
            evt.type === "content_block_delta" &&
            evt.delta.type === "input_json_delta" &&
            currentToolName
          ) {
            // We'll emit the tool event when the block stops
            // (input arrives incrementally so we wait for completion)
          }

          // Tool block finished — emit tool event with name
          if (evt.type === "content_block_stop" && currentToolName) {
            await stream.writeSSE({
              event: "tool",
              data: JSON.stringify({ tool: currentToolName }),
            });
            currentToolName = null;
          }
        }

        if (msg.type === "result") {
          await stream.writeSSE({
            event: "done",
            data: JSON.stringify({ subtype: msg.subtype }),
          });
        }
      }
    } catch (err: any) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: err.message || "Unknown error" }),
      });
    }
  });
});

export default chat;
