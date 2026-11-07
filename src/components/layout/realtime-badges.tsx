"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { describeNotification } from "@/lib/notifications";
import { formatRelative } from "@/lib/i18n/format";
import type { Notification } from "@/lib/supabase/database.types";
import { markAllNotificationsReadAction } from "@/actions/notifications";
import { cn } from "@/lib/utils";

function Count({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-white ring-2 ring-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function MessagesBadge({ userId, initial }: { userId: string; initial: number }) {
  const { d } = useI18n();
  const [count, setCount] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setCount(initial);
  }
  useEffect(() => {
    const supabase = createClient();
    const refresh = async () => {
      const { data } = await supabase.rpc("unread_message_count");
      if (typeof data === "number") setCount(data);
    };
    const ch = supabase
      .channel(`unread-messages-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [userId]);
  return (
    <Link href="/dashboard/messages" className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100" aria-label={d.nav.messages}>
      <MessageCircle className="size-5" />
      <Count n={count} />
    </Link>
  );
}

export function NotificationBell({ userId, initial }: { userId: string; initial: number }) {
  const { d, locale } = useI18n();
  const [count, setCount] = useState(initial);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { count: c }] = await Promise.all([
      supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
    ]);
    setItems(data ?? []);
    setCount(c ?? 0);
  }, [userId]);

  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setCount(initial);
  }
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        setCount((c) => c + 1);
        setItems(null);
      })
      .subscribe();
    return () => void supabase.removeChannel(ch);
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { if (!open) void load(); setOpen(!open); }} className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100" aria-label={d.nav.notifications} aria-expanded={open}>
        <Bell className="size-5" />
        <Count n={count} />
      </button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-lift)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="font-semibold">{d.notifications.title}</span>
            {count > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-brand-700 hover:underline"
                onClick={async () => {
                  await markAllNotificationsReadAction();
                  setCount(0);
                  setItems((xs) => xs?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? null);
                }}
              >
                {d.notifications.markAllRead}
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items === null ? (
              <li className="px-4 py-6 text-center text-sm text-slate-500">{d.common.loading}</li>
            ) : items.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-slate-500">{d.notifications.empty}</li>
            ) : (
              items.map((n) => {
                const info = describeNotification(n, d, locale);
                return (
                  <li key={n.id}>
                    <Link href={info.href} onClick={() => setOpen(false)} className={cn("block border-b border-slate-50 px-4 py-3 hover:bg-slate-50", !n.read_at && "bg-brand-50/60")}>
                      <p className="text-sm font-semibold text-slate-900">{info.title}</p>
                      <p className="line-clamp-2 text-sm text-slate-600">{info.body}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatRelative(n.created_at, locale)}</p>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
          <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="block bg-slate-50 px-4 py-2.5 text-center text-sm font-semibold text-brand-700 hover:bg-slate-100">
            {d.notifications.viewAll}
          </Link>
        </div>
      )}
    </div>
  );
}
