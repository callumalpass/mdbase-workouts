import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useChat } from "./useChat";

function createStreamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true, value: undefined };
            }
            const chunk = encoder.encode(chunks[index]);
            index += 1;
            return { done: false, value: chunk };
          },
        };
      },
    },
  } as unknown as Response;
}

describe("useChat", () => {
  it("surfaces non-ok errors and writes fallback assistant text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Bad Request",
        json: async () => ({ error: "Invalid chat payload" }),
      } as Response)
    );

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.send("hello");
    });

    await waitFor(() => {
      expect(result.current.streaming).toBe(false);
    });

    expect(result.current.error).toBe("Invalid chat payload");
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Invalid chat payload",
    });
  });

  it("assembles streamed text and persists returned session id", async () => {
    const chunks = [
      "event: session\ndata: {\"sessionId\":\"sess-123\"}\n\n",
      "event: text\ndata: \"Hello \"\n\n",
      "event: text\ndata: \"world\"\n\n",
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createStreamResponse(chunks)));

    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.send("hi");
    });

    await waitFor(() => {
      expect(result.current.streaming).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "Hello world",
    });
    expect(localStorage.getItem("workout-chat-session")).toBe("sess-123");
  });
});

