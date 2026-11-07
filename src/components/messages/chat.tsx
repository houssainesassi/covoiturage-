"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { toErrorCode } from "@/lib/errors";
import { formatDate, formatTime } from "@/lib/i18n/format";
import { tunisDateKey } from "@/lib/i18n/format";
import type { Message } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export function Chat({ conversationId, userId, initial, canSend }: { conversationId: string; userId: string; initial: Message[]; canSend: boolean }) {
  const { d, locale } = useI18n();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initial);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    const markRead = () => supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
    void markRead();
    const ch = supabase
      .channel(`chat-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (p) => {
        const m = p.new as Message;
        setMessages((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
        if (m.sender_id !== userId) void markRead();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (p) => {
        const m = p.new as Message;
        setMessages((xs) => xs.map((x) => (x.id === m.id ? { ...x, read_at: m.read_at } : x)));
      })
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [conversationId, userId, supabase]);

  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const { data, error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: userId, body: text.slice(0, 2000) }).select().single();
    setSending(false);
    if (error) return void toast.error(d.errors[toErrorCode(error)]);
    setBody("");
    setMessages((xs) => (xs.some((x) => x.id === data.id) ? xs : [...xs, data]));
    router.refresh();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-slate-500">{d.messages.noMessages}</p>}
        {messages.map((m, i) => {
          const mine = m.sender_id === userId;
          const showDay = i === 0 || tunisDateKey(new Date(m.created_at)) !== tunisDateKey(new Date(messages[i - 1].created_at));
          return (
            <div key={m.id}>
              {showDay && <p className="my-3 text-center text-xs font-medium text-slate-400">{formatDate(m.created_at, locale)}</p>}
              <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] shadow-sm", mine ? "rounded-ee-md bg-brand-600 text-white" : "rounded-es-md bg-white text-slate-900 ring-1 ring-slate-200")}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[11px]", mine ? "text-brand-100" : "text-slate-400")}>
                    {formatTime(m.created_at, locale)}
                    {mine && (m.read_at ? <CheckCheck className="size-3.5" aria-label={d.messages.read} /> : <Check className="size-3.5" aria-label={d.messages.sent} />)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {canSend ? (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-200 bg-white p-3">
          <label htmlFor="chat-input" className="sr-only">{d.messages.placeholder}</label>
          <textarea
            id="chat-input"
            rows={1}
            value={body}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(e); } }}
            placeholder={d.messages.placeholder}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 px-3.5 py-2.5 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
          />
          <button type="submit" disabled={!body.trim() || sending} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50" aria-label={d.messages.send}>
            <SendHorizontal className="size-5 rtl:rotate-180" />
          </button>
        </form>
      ) : <p className="border-t border-slate-200 bg-red-50 p-3 text-center text-sm text-red-700">{d.messages.suspended}</p>}
    </div>
  );
}
