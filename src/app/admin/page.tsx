import { Ban, CalendarCheck, Car, CheckCircle2, Flag, MessageCircle, UserPlus, Users, Wallet, XCircle, Clock, Route } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDateTime, formatNumber, formatPrice } from "@/lib/i18n/format";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/misc";
import { DemoBadge } from "@/components/ui/badge";

type Stats = Record<string, number> & { daily: { day: string; signups: number; trips: number; bookings: number }[] };

export default async function AdminPage() {
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [{ data }, { data: actions }] = await Promise.all([
    supabase.rpc("admin_stats"),
    supabase.from("admin_actions").select("id, action, target_type, details, created_at, admin:profiles!admin_actions_admin_id_fkey(full_name)").order("created_at", { ascending: false }).limit(15),
  ]);
  const s = (data ?? { daily: [] }) as unknown as Stats;
  const n = (k: string) => formatNumber(Number(s[k] ?? 0), locale);
  const max = Math.max(1, ...s.daily.map((x) => Math.max(x.signups, x.trips, x.bookings)));
  const series = [
    { key: "signups" as const, label: d.admin.signups, color: "bg-brand-500" },
    { key: "trips" as const, label: d.admin.trips, color: "bg-accent-500" },
    { key: "bookings" as const, label: d.admin.bookings, color: "bg-sky-500" },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title={d.admin.title} />
      {Number(s.demo_trips ?? 0) > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <DemoBadge label={d.common.demo} />{fmt(d.admin.demoSummary, { trips: n("demo_trips"), users: n("demo_users") })}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={d.admin.stats.users} value={n("users_total")} icon={<Users className="size-5" />} />
        <StatCard label={d.admin.stats.newUsers} value={n("users_new_7d")} icon={<UserPlus className="size-5" />} tone="accent" />
        <StatCard label={d.admin.stats.drivers} value={n("drivers_total")} icon={<Car className="size-5" />} tone="slate" />
        <StatCard label={d.admin.stats.suspended} value={n("users_suspended")} icon={<Ban className="size-5" />} tone="slate" />
        <StatCard label={d.admin.stats.trips} value={n("trips_total")} icon={<Route className="size-5" />} />
        <StatCard label={d.admin.stats.scheduled} value={n("trips_scheduled")} icon={<Clock className="size-5" />} tone="accent" />
        <StatCard label={d.admin.stats.completed} value={n("trips_completed")} icon={<CheckCircle2 className="size-5" />} tone="slate" />
        <StatCard label={d.admin.stats.cancelled} value={n("trips_cancelled")} icon={<XCircle className="size-5" />} tone="slate" />
        <StatCard label={d.admin.stats.bookings} value={n("bookings_total")} icon={<CalendarCheck className="size-5" />} />
        <StatCard label={d.admin.stats.pending} value={n("bookings_pending")} icon={<Clock className="size-5" />} tone="accent" />
        <StatCard label={d.admin.stats.bookingsCompleted} value={n("bookings_completed")} icon={<CheckCircle2 className="size-5" />} tone="slate" />
        <StatCard label={d.admin.stats.volume} value={formatPrice(Number(s.volume_tnd ?? 0), locale)} icon={<Wallet className="size-5" />} tone="slate" />
        <StatCard label={d.admin.stats.openReports} value={n("reports_open")} icon={<Flag className="size-5" />} tone="accent" />
        <StatCard label={d.admin.stats.messages} value={n("messages_total")} icon={<MessageCircle className="size-5" />} tone="slate" />
      </div>
      <Card>
        <CardHeader title={d.admin.activity} action={<div className="flex gap-3 text-xs">{series.map((x) => <span key={x.key} className="flex items-center gap-1"><span className={`size-2.5 rounded-full ${x.color}`} />{x.label}</span>)}</div>} />
        <div className="flex h-48 items-end gap-1 px-5 pb-4 pt-6 sm:px-6" role="img" aria-label={d.admin.activity}>
          {s.daily.map((day) => (
            <div key={day.day} className="flex flex-1 items-end justify-center gap-px" title={`${day.day}: ${day.signups} / ${day.trips} / ${day.bookings}`}>
              {series.map((x) => <div key={x.key} className={`w-1/3 rounded-t ${x.color}`} style={{ height: `${(day[x.key] / max) * 150}px`, minHeight: day[x.key] ? 3 : 0 }} />)}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title={d.admin.recentActions} />
        {(actions ?? []).length ? (
          <ul className="divide-y divide-slate-100">
            {actions!.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm sm:px-6">
                <span><strong>{a.admin?.full_name}</strong> · {d.admin.actions[a.action as keyof typeof d.admin.actions] ?? a.action}</span>
                <span className="text-slate-400">{formatDateTime(a.created_at, locale)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-6 text-sm text-slate-500 sm:px-6">{d.admin.noActions}</p>}
      </Card>
    </div>
  );
}
