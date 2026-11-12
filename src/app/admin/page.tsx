import Link from "next/link";
import { Ban, CalendarCheck, Car, ClipboardList, Clock, ExternalLink, Flag, MessageCircle, Route, Users, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDate, formatNumber, formatPrice, formatRelative } from "@/lib/i18n/format";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { DemoBadge } from "@/components/ui/badge";
import { ActivityPanel, AttentionCard, Breakdown, Kpi, type Day } from "@/components/admin/overview";

type Stats = Record<string, number> & { daily: Day[] };
const TARGET_LINKS: Record<string, string> = { user: "/users/", trip: "/trips/" };

export default async function AdminPage() {
  // The layout guards too, but pages render in parallel with it: redirect before any admin query.
  await requireAdmin();
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [stats, log] = await Promise.all([
    supabase.rpc("admin_stats"),
    supabase.from("admin_actions").select("id, action, target_type, target_id, details, created_at, admin:profiles!admin_actions_admin_id_fkey(full_name)").order("created_at", { ascending: false }).limit(15),
  ]);
  if (stats.error) throw new Error(stats.error.message);
  if (log.error) throw new Error(log.error.message);
  const s = stats.data as unknown as Stats;
  const actions = log.data ?? [];
  const num = (k: string) => Number(s[k] ?? 0);
  const n = (k: string) => formatNumber(num(k), locale);
  const hint = (template: string, k: string) => fmt(template, { n: n(k) });
  const part = (label: string, key: string, color: string) => ({ label, value: num(key), display: n(key), color });

  const series = [
    { key: "signups" as const, label: d.admin.signups },
    { key: "trips" as const, label: d.admin.trips },
    { key: "bookings" as const, label: d.admin.bookings },
  ];
  const sum = (key: (typeof series)[number]["key"]) => s.daily.reduce((acc, day) => acc + day[key], 0);
  const max = Math.max(1, ...s.daily.flatMap((x) => [x.signups, x.trips, x.bookings]));
  const hasActivity = series.some((x) => sum(x.key) > 0);

  return (
    <div className="space-y-6">
      <PageHeader title={d.admin.overview} description={d.admin.overviewSubtitle} />
      {num("demo_trips") > 0 && (
        <p className="-mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          <DemoBadge label={d.common.demo} />{fmt(d.admin.demoSummary, { trips: n("demo_trips"), users: n("demo_users") })}
        </p>
      )}

      <section aria-labelledby="attention">
        <h2 id="attention" className="mb-2.5 text-sm font-semibold text-slate-700">{d.admin.needsAttention}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <AttentionCard href="/admin/reports" count={num("reports_open")} value={n("reports_open")} label={d.admin.attentionReports} icon={<Flag className="size-5" />} tone="danger" />
          <AttentionCard href="/admin/bookings?status=pending" count={num("bookings_pending")} value={n("bookings_pending")} label={d.admin.attentionBookings} icon={<Clock className="size-5" />} tone="warning" />
          <AttentionCard href="/admin/users?status=suspended" count={num("users_suspended")} value={n("users_suspended")} label={d.admin.attentionSuspended} icon={<Ban className="size-5" />} tone="warning" />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi href="/admin/users" label={d.admin.stats.users} value={n("users_total")} hint={hint(d.admin.thisWeek, "users_new_7d")} icon={<Users className="size-4.5" aria-hidden />} />
        <Kpi label={d.admin.stats.drivers} value={n("drivers_total")} hint={d.admin.driversHint} icon={<Car className="size-4.5" aria-hidden />} />
        <Kpi href="/admin/trips" label={d.admin.stats.trips} value={n("trips_total")} hint={hint(d.admin.upcomingHint, "trips_scheduled")} icon={<Route className="size-4.5" aria-hidden />} />
        <Kpi href="/admin/bookings" label={d.admin.stats.bookings} value={n("bookings_total")} hint={hint(d.admin.pendingHint, "bookings_pending")} icon={<CalendarCheck className="size-4.5" aria-hidden />} />
        <Kpi label={d.admin.stats.volume} value={formatPrice(num("volume_tnd"), locale)} hint={d.admin.volumeHint} icon={<Wallet className="size-4.5" aria-hidden />} />
        <Kpi label={d.admin.stats.messages} value={n("messages_total")} hint={d.admin.messagesHint} icon={<MessageCircle className="size-4.5" aria-hidden />} />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title={d.admin.activity} />
          {hasActivity ? (
            <div className="grid gap-6 p-5 sm:grid-cols-3 sm:p-6">
              {series.map((x) => (
                <ActivityPanel
                  key={x.key}
                  title={x.label}
                  total={formatNumber(sum(x.key), locale)}
                  days={s.daily}
                  dataKey={x.key}
                  max={max}
                  maxLabel={formatNumber(max, locale)}
                  tooltip={(day) => `${formatDate(day.day, locale, "short")}: ${formatNumber(day[x.key], locale)}`}
                  startLabel={formatDate(s.daily[0].day, locale, "short")}
                  endLabel={formatDate(s.daily[s.daily.length - 1].day, locale, "short")}
                />
              ))}
              <table className="sr-only">
                <caption>{d.admin.activity}</caption>
                <thead><tr><th scope="col">{d.admin.day}</th>{series.map((x) => <th key={x.key} scope="col">{x.label}</th>)}</tr></thead>
                <tbody>{s.daily.map((day) => <tr key={day.day}><th scope="row">{formatDate(day.day, locale, "short")}</th>{series.map((x) => <td key={x.key}>{day[x.key]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          ) : <p className="p-6 text-center text-sm text-slate-500">{d.admin.noActivity}</p>}
        </Card>
        <Card>
          <CardHeader title={d.admin.breakdown} />
          <div className="grid gap-6 p-5 sm:grid-cols-2 sm:gap-10 sm:p-6">
            <Breakdown title={d.admin.trips} total={num("trips_total")} parts={[
              part(d.admin.stats.scheduled, "trips_scheduled", "bg-brand-500"),
              part(d.admin.stats.completed, "trips_completed", "bg-sky-500"),
              part(d.admin.stats.cancelled, "trips_cancelled", "bg-red-500"),
            ]} />
            <Breakdown title={d.admin.bookings} total={num("bookings_total")} parts={[
              part(d.admin.stats.pending, "bookings_pending", "bg-amber-500"),
              part(d.admin.stats.confirmed, "bookings_confirmed", "bg-emerald-500"),
              part(d.admin.stats.bookingsCompleted, "bookings_completed", "bg-sky-500"),
              part(d.admin.bookingsCancelled, "bookings_cancelled", "bg-slate-400"),
            ]} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={d.admin.recentActions} />
        {actions.length ? (
          <ul className="divide-y divide-slate-100">
            {actions.map((a) => {
              const link = a.target_id && TARGET_LINKS[a.target_type] ? `${TARGET_LINKS[a.target_type]}${a.target_id}` : null;
              const details = a.details as { reason?: unknown } | null;
              const reason = typeof details?.reason === "string" ? details.reason : null;
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm sm:px-6">
                  <div className="min-w-0">
                    <p><bdi className="font-semibold text-slate-900">{a.admin?.full_name ?? d.common.unknownUser}</bdi> <span className="text-slate-500">·</span> {d.admin.actions[a.action as keyof typeof d.admin.actions] ?? a.action}</p>
                    {reason && <p dir="auto" className="mt-0.5 text-start text-xs text-slate-500 wrap-anywhere">{reason}</p>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{formatRelative(a.created_at, locale)}</span>
                    {link && <Link href={link} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">{d.common.view}<ExternalLink className="size-3" aria-hidden /></Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <div className="p-5 sm:p-6"><EmptyState icon={<ClipboardList className="size-6" aria-hidden />} title={d.admin.noActions} /></div>}
      </Card>
    </div>
  );
}
