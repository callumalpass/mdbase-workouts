import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatMessage } from "../lib/types";
import { parseJsonString, parseSseEvents } from "../lib/chatStream";

const STORAGE_KEY = "workout-chat-history";
const SESSION_KEY = "workout-chat-session";

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadSessionId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(loadSessionId());

  // Persist messages to localStorage whenever they change (but not while streaming)
  useEffect(() => {
    if (!streaming) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages, streaming]);

  const send = useCallback(async (text: string) => {
    setError(null);
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: sessionIdRef.current,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText || "Chat request failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream received");

      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buf += decoder.decode();
        } else {
          buf += decoder.decode(value, { stream: true });
        }

        const parsed = parseSseEvents(buf);
        buf = parsed.remainder;

        for (const evt of parsed.events) {
          if (evt.event === "session" && evt.data) {
            try {
              const d = JSON.parse(evt.data);
              if (d.sessionId) {
                sessionIdRef.current = d.sessionId;
                localStorage.setItem(SESSION_KEY, d.sessionId);
              }
            } catch {
              // Ignore malformed session messages.
            }
          } else if (evt.event === "text" && evt.data) {
            const chunk = parseJsonString(evt.data);
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + chunk,
                };
              }
              return updated;
            });
          } else if (evt.event === "error") {
            let message = "Something went wrong. Please try again.";
            try {
              const payload = JSON.parse(evt.data);
              if (payload?.error) message = String(payload.error);
            } catch {
              if (evt.data) message = evt.data;
            }
            throw new Error(message);
          }
        }

        if (done) break;
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const errorMessage = err.message || "Something went wrong. Please try again.";
        setError(errorMessage);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content) {
            updated[updated.length - 1] = {
              ...last,
              content: errorMessage,
            };
          }
          return updated;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    setError(null);
    sessionIdRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  return { messages, streaming, error, send, stop, clearHistory };
}
