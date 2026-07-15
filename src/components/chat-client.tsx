"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ChatMessage = {
  id: string;
  sender: string;
  body: string;
  created_at: string;
};

export function ChatClient({
  channelKind,
  channelId,
  initialMessages,
  meId,
  names,
  colors,
  readOnly = false,
}: {
  channelKind: string;
  channelId: string;
  initialMessages: ChatMessage[];
  meId: string;
  names: Record<string, string>;
  colors: Record<string, string>;
  readOnly?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useRef(createClient());

  useEffect(() => {
    const channel = supabase.current
      .channel(`chat-${channelKind}-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const m = payload.new as ChatMessage & { channel_kind: string };
          if (m.channel_kind !== channelKind) return;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
      )
      .subscribe();
    return () => {
      supabase.current.removeChannel(channel);
    };
  }, [channelKind, channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    const { data, error } = await supabase.current
      .from("chat_messages")
      .insert({ channel_kind: channelKind, channel_id: channelId, sender: meId, body })
      .select("id, sender, body, created_at")
      .single();
    if (!error && data) {
      setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]));
      // push notifications fan out from a DB trigger (mig 027) — nothing to do here
    } else if (error) {
      setDraft(body);
      alert(error.message);
    }
    setSending(false);
  };

  let lastDay = "";

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-stone-200 bg-white supports-[height:1dvh]:h-[70dvh]">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-stone-400">No messages yet — say hi! 👋</p>
        )}
        {messages.map((m) => {
          const mine = m.sender === meId;
          const day = new Date(m.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 text-center text-[10px] font-medium uppercase tracking-wide text-stone-400">{day}</div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? "bg-stone-900 text-white" : "bg-stone-100"}`}>
                  {!mine && (
                    <div className="text-[11px] font-semibold" style={{ color: colors[m.sender] ?? "#57534e" }}>
                      {names[m.sender] ?? "Member"}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words text-sm">{m.body}</div>
                  <div className={`mt-0.5 text-right text-[10px] ${mine ? "text-white/60" : "text-stone-400"}`}>
                    {new Date(m.created_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {readOnly ? (
        <div className="border-t border-stone-100 p-3 text-center text-xs text-stone-400">
          Read-only view
        </div>
      ) : (
      <div className="flex items-end gap-2 border-t border-stone-100 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Message…"
          className="max-h-32 flex-1 resize-none rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500"
        />
        <button
          onClick={send}
          disabled={!draft.trim() || sending}
          className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
        >
          ➤
        </button>
      </div>
      )}
    </div>
  );
}
