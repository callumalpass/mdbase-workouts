import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { useChat } from "../hooks/useChat";
import { haptics } from "../lib/haptics";

export default function ChatTab() {
  const { messages, streaming, error, send, stop, clearHistory } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || streaming) return;
    haptics.tap();
    setInput("");
    send(text);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-8 pb-4">
        <h1 className="text-4xl font-bold tracking-tight">Chat</h1>
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            disabled={streaming}
            className="text-[10px] font-mono text-faded uppercase tracking-widest hover:text-blush transition-colors disabled:opacity-30"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-16">
            <p className="text-2xl italic text-faded/40 mb-3">Ask me anything</p>
            <div className="flex gap-2">
              {["workouts", "plans", "advice"].map((tag) => (
                <span key={tag} className="text-[10px] font-mono uppercase tracking-[0.15em] text-faded border border-rule px-2.5 py-1">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blush/10 text-ink border border-blush/20"
                  : "bg-card text-ink border-l-2 border-blush"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="chat-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {msg.content}
                  </ReactMarkdown>
                  {streaming && i === messages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 bg-blush ml-0.5 animate-pulse align-text-bottom" />
                  )}
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div className="border-t border-rule p-4 bg-card">
        {error && (
          <p className="mb-2 text-[11px] font-mono text-blush bg-blush/5 border border-blush/20 px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about your workouts..."
            className="flex-1 px-4 py-3 bg-paper border border-rule text-sm
              placeholder:text-faded/50 placeholder:italic
              focus:outline-none focus:border-blush transition-colors"
          />
          {streaming ? (
            <button
              onClick={stop}
              className="px-5 py-3 bg-rule text-faded text-xs font-mono font-medium uppercase tracking-wider
                active:opacity-70 transition-opacity"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="px-5 py-3 bg-blush text-white text-xs font-mono font-medium uppercase tracking-wider
                active:scale-[0.97] transition-transform duration-75 disabled:opacity-30"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
