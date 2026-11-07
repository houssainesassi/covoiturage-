import { Car, Route, Users, Wallet, Hourglass, Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatMonth, formatNumber, formatPrice } from "@/lib/i18n/format";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/misc";

type Stats = {
  total_earnings: number; expected_earnings: number; passengers_transported: number; trips_completed: number;
  trips_upcoming: number; pending_requests: number; distance_km: number;
  monthly: { month: string; earnings: number; seats: number }[];
};

export default async function EarningsPage() {
  await requireUser("/dashboard/earnings");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data } = await supabase.rpc("driver_stats");
  const s = (data ?? {}) as unknown as Stats;
  const monthly = s.monthly ?? [];
  const max = Math.max(1, ...monthly.map((m) => Number(m.earnings)));
  return (
    <div className="space-y-6">
      <PageHeader title={d.earnings.title} description={d.earnings.subtitle} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={d.earnings.total} value={formatPrice(Number(s.total_earnings ?? 0), locale)} icon={<Wallet className="size-5" />} />
        <StatCard label={d.earnings.expected} value={formatPrice(Number(s.expected_earnings ?? 0), locale)} icon={<Hourglass className="size-5" />} tone="accent" />
        <StatCard label={d.earnings.passengers} value={formatNumber(Number(s.passengers_transported ?? 0), locale)} icon={<Users className="size-5" />} tone="slate" />
        <StatCard label={d.earnings.tripsCompleted} value={formatNumber(Number(s.trips_completed ?? 0), locale)} icon={<Car className="size-5" />} />
        <StatCard label={d.earnings.upcoming} value={formatNumber(Number(s.trips_upcoming ?? 0), locale)} icon={<Bell className="size-5" />} tone="slate" />
        <StatCard label={d.earnings.distance} value={fmt(d.units.km, { count: formatNumber(Number(s.distance_km ?? 0), locale) })} icon={<Route className="size-5" />} tone="accent" />
      </div>
      <Card>
        <CardHeader title={d.earnings.monthly} />
        {monthly.some((m) => Number(m.earnings) > 0) ? (
          <div className="flex h-56 items-end gap-2 px-5 pb-5 pt-6 sm:px-6" role="img" aria-label={d.earnings.monthly}>
            {monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-medium text-slate-500">{Number(m.earnings) > 0 ? formatNumber(Number(m.earnings), locale) : ""}</span>
                <div className="w-full rounded-t-lg bg-brand-500/90" style={{ height: `${(Number(m.earnings) / max) * 140}px`, minHeight: Number(m.earnings) > 0 ? 4 : 2 }} title={formatPrice(Number(m.earnings), locale)} />
                <span className="text-[10px] text-slate-400">{formatMonth(m.month, locale)}</span>
              </div>
            ))}
          </div>
        ) : <p className="px-5 py-8 text-center text-sm text-slate-500 sm:px-6">{d.earnings.noData}</p>}
      </Card>
      <p className="text-xs text-slate-500">{d.earnings.note}</p>
    </div>
  );
}
