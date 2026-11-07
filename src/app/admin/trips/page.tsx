import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDateTime, formatPrice } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { PageHeader } from "@/components/ui/card";
import { Badge, tripTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/misc";
import { FilterBar, Table } from "@/components/admin/table";
import { CancelTripButton } from "@/components/admin/admin-actions";

const PAGE = 25;

export default async function AdminTripsPage({ searchParams }: PageProps<"/admin/trips">) {
  const sp = await searchParams;
  const status = ["scheduled", "completed", "cancelled"].includes(String(sp.status)) ? (sp.status as "scheduled" | "completed" | "cancelled") : null;
  const city = typeof sp.city === "string" ? sp.city : "";
  const page = Math.max(Number(sp.page) || 1, 1);
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locations = await getLocations();
  const locs = new Map(locations.map((l) => [l.id, l]));
  const cityLoc = locations.find((l) => l.slug === city);
  let q = supabase.from("trips").select("id, departure_at, origin_id, destination_id, seats_total, seats_available, price_per_seat, status, driver:profiles!trips_driver_id_fkey(id, full_name)", { count: "exact" });
  if (status) q = q.eq("status", status);
  if (cityLoc) q = q.or(`origin_id.eq.${cityLoc.id},destination_id.eq.${cityLoc.id}`);
  const { data, count } = await q.order("departure_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const totalPages = Math.ceil((count ?? 0) / PAGE);
  const now = new Date().toISOString();
  return (
    <div>
      <PageHeader title={d.admin.trips} />
      <FilterBar>
        <Select name="status" defaultValue={status ?? ""} className="w-auto" aria-label={d.common.status}><option value="">{d.admin.allStatuses}</option>{(["scheduled", "completed", "cancelled"] as const).map((s) => <option key={s} value={s}>{d.status.trip[s]}</option>)}</Select>
        <Select name="city" defaultValue={city} className="w-auto" aria-label={d.admin.filterCity}><option value="">{d.admin.filterCity}</option>{locations.filter((l) => l.kind === "city").map((l) => <option key={l.id} value={l.slug}>{locName(l, locale)}</option>)}</Select>
        <Button type="submit" variant="outline">{d.common.apply}</Button>
      </FilterBar>
      <Table head={[d.admin.route, d.admin.departure, d.admin.driver, d.admin.seats, d.common.price, d.common.status, d.common.actions]} empty={!data?.length && <p className="p-6 text-center text-sm text-slate-500">{d.admin.empty}</p>}>
        {(data ?? []).map((t) => {
          const key = t.status === "scheduled" && t.departure_at <= now ? "departed" : t.status;
          return (
            <tr key={t.id}>
              <td className="px-4 py-3 font-medium"><Link href={`/trips/${t.id}`} className="hover:text-brand-700">{routeLabel(locName(locs.get(t.origin_id), locale), locName(locs.get(t.destination_id), locale), locale)}</Link></td>
              <td className="px-4 py-3 text-slate-600">{formatDateTime(t.departure_at, locale)}</td>
              <td className="px-4 py-3">{t.driver && <Link href={`/users/${t.driver.id}`} className="hover:text-brand-700">{t.driver.full_name}</Link>}</td>
              <td className="px-4 py-3">{t.seats_total - t.seats_available}/{t.seats_total}</td>
              <td className="px-4 py-3">{formatPrice(Number(t.price_per_seat), locale)}</td>
              <td className="px-4 py-3"><Badge tone={tripTone[key]}>{d.status.trip[key]}</Badge></td>
              <td className="px-4 py-3">{t.status === "scheduled" && <CancelTripButton id={t.id} />}</td>
            </tr>
          );
        })}
      </Table>
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/admin/trips?${new URLSearchParams({ ...(status && { status }), ...(city && { city }), page: String(p) })}`} labels={{ previous: d.common.previous, next: d.common.next, pageOf: fmt(d.common.pageOf, { page, total: totalPages }) }} />
    </div>
  );
}
