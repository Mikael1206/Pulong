"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, Send } from "lucide-react";
import type { ChatMessage } from "@/hooks/useWebRTC";

export interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  localSocketId: string | null;
  onSend: (text: string) => void;
}

export function ChatDrawer({
  open,
  onClose,
  messages,
  localSocketId,
  onSend,
}: ChatDrawerProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  if (!open) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-foreground/10 bg-zinc-950 shadow-md">
      <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
        <h2 className="text-sm font-semibold">Chat</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="focus-ring rounded-lg p-1.5 text-[var(--muted)] hover:bg-foreground/10 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-center text-xs text-[var(--muted)]">
            No messages yet. Say hello to the room.
          </p>
        ) : (
          messages.map((message) => {
            const isMine = message.senderId === localSocketId;
            return (
              <div
                key={message.id}
                className={`flex flex-col gap-0.5 ${
                  isMine ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-baseline gap-2 text-[11px] text-[var(--muted)]">
                  <span className="font-medium text-foreground/80">
                    {isMine ? "You" : message.senderName}
                  </span>
                  <time dateTime={new Date(message.timestamp).toISOString()}>
                    {formatTime(message.timestamp)}
                  </time>
                </div>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm break-words ${
                    isMine
                      ? "bg-emerald-600 text-white"
                      : "bg-foreground/10 text-foreground"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-foreground/10 p-3"
      >
        <label htmlFor="chat-draft" className="sr-only">
          Chat message
        </label>
        <input
          id="chat-draft"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={2000}
          className="focus-ring flex-1 rounded-lg border border-foreground/20 bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={draft.trim().length === 0}
          aria-label="Send message"
          className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </aside>
  );
}

function formatTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
