import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProfile, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDate } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { uuidSchema } from "@/lib/validation";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Chat } from "@/components/messages/chat";
import { ConversationList } from "@/components/messages/conversation-list";
import { ReportDialog } from "@/components/report/report-dialog";

export default async function ConversationPage({ params }: PageProps<"/dashboard/messages/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/messages/${id}`);
  if (!uuidSchema.safeParse(id).success) notFound();
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locs = await getLocationMap();
  const profile = await getProfile();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, trip_id, driver_id, passenger_id, trip:trips!conversations_trip_id_fkey(id, origin_id, destination_id, departure_at), driver:profiles!conversations_driver_id_fkey(id, full_name, avatar_path), passenger:profiles!conversations_passenger_id_fkey(id, full_name, avatar_path)")
    .eq("id", id)
    .maybeSingle();
  if (!conv) notFound();
  const { data: messages } = await supabase.from("messages").select("*").eq("conversation_id", id).order("created_at", { ascending: false }).limit(100);
  const other = conv.driver_id === user.id ? conv.passenger : conv.driver;
  const otherRole = conv.driver_id === user.id ? d.messages.passengerLabel : d.messages.driverLabel;
  const route = conv.trip ? routeLabel(locName(locs.get(conv.trip.origin_id), locale), locName(locs.get(conv.trip.destination_id), locale), locale) : "";

  return (
    <Card className="grid grid-cols-1 h-[calc(100dvh-9rem)] overflow-hidden md:h-[75vh] md:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="hidden overflow-y-auto border-e border-slate-200 md:block"><ConversationList userId={user.id} activeId={id} /></div>
      <div className="flex min-h-0 flex-col bg-sand-50">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <Link href="/dashboard/messages" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 md:hidden" aria-label={d.common.back}><ArrowLeft className="size-5 rtl:rotate-180" /></Link>
          <Avatar path={other?.avatar_path} name={other?.full_name} />
          <div className="min-w-0 flex-1">
            <Link href={`/users/${other?.id}`} className="block truncate font-semibold hover:text-brand-700">{other?.full_name}</Link>
            {conv.trip && <Link href={`/trips/${conv.trip.id}`} className="block truncate text-xs text-slate-500 hover:text-brand-700">{otherRole} · {fmt(d.messages.about, { route, date: formatDate(conv.trip.departure_at, locale, "short") })}</Link>}
          </div>
          {other && <ReportDialog userId={other.id} name={other.full_name} tripId={conv.trip_id} compact />}
        </div>
        <Chat conversationId={id} userId={user.id} initial={(messages ?? []).reverse()} canSend={profile?.status === "active"} />
      </div>
    </Card>
  );
}
