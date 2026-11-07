import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export async function ConversationList({ userId, activeId }: { userId: string; activeId?: string }) {
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locs = await getLocationMap();
  const [{ data: convs }, { data: unread }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, last_message_at, last_message_preview, last_sender_id, driver_id, passenger_id, created_at, trip:trips!conversations_trip_id_fkey(origin_id, destination_id, departure_at), driver:profiles!conversations_driver_id_fkey(id, full_name, avatar_path), passenger:profiles!conversations_passenger_id_fkey(id, full_name, avatar_path)")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.rpc("conversation_unread_counts"),
  ]);
  const unreadMap = new Map((unread ?? []).map((u) => [u.conversation_id, u.unread]));
  if (!convs?.length) return <p className="p-6 text-center text-sm text-slate-500">{d.messages.empty}<br />{d.messages.emptyBody}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {convs.map((c) => {
        const other = c.driver_id === userId ? c.passenger : c.driver;
        const n = unreadMap.get(c.id) ?? 0;
        return (
          <li key={c.id}>
            <Link href={`/dashboard/messages/${c.id}`} className={cn("flex gap-3 px-4 py-3 hover:bg-slate-50", c.id === activeId && "bg-brand-50")}>
              <Avatar path={other?.avatar_path} name={other?.full_name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn("truncate text-sm", n ? "font-bold" : "font-semibold")}>{other?.full_name || d.common.unknownUser}</p>
                  {c.last_message_at && <span className="shrink-0 text-[11px] text-slate-400">{formatRelative(c.last_message_at, locale)}</span>}
                </div>
                {c.trip && <p className="truncate text-xs text-brand-700">{routeLabel(locName(locs.get(c.trip.origin_id), locale), locName(locs.get(c.trip.destination_id), locale), locale)}</p>}
                <div className="flex items-center gap-2">
                  <p className={cn("min-w-0 flex-1 truncate text-sm", n ? "text-slate-900" : "text-slate-500")}>{c.last_sender_id === userId ? `${d.messages.you}: ` : ""}{c.last_message_preview ?? d.messages.noMessages}</p>
                  {n > 0 && <span className="rounded-full bg-accent-500 px-1.5 text-xs font-bold text-white">{n}</span>}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
