import Link from "next/link";
import { Route } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatPrice } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { contains, oneOf, pageParam, rangeOf, rowsOf, textParam } from "@/lib/admin";
import { PageHeader } from "@/components/ui/card";
import { Badge, DemoBadge, tripTone } from "@/components/ui/badge";
import { DataTable, FilterBar, ListEmpty, listHref, Person, RowActions, SearchField, TablePager, Td, ViewLink } from "@/components/admin/table";
import { FilterSelect } from "@/components/admin/filter-select";
import { CancelTripButton } from "@/components/admin/admin-actions";

const STATUSES = ["scheduled", "completed", "cancelled"] as const;

export default async function AdminTripsPage({ searchParams }: PageProps<"/admin/trips">) {
  const sp = await searchParams;
  const q = textParam(sp.q);
  const status = oneOf(sp.status, STATUSES);
  const city = textParam(sp.city);
  const data = oneOf(sp.data, ["real", "demo"] as const);
  const page = pageParam(sp.page);
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locations = await getLocations();
  const locs = new Map(locations.map((l) => [l.id, l]));
  const cityLoc = locations.find((l) => l.slug === city);
  let query = supabase.from("trips").select("id, departure_at, origin_id, destination_id, seats_total, seats_available, price_per_seat, status, is_demo, driver:profiles!trips_driver_id_fkey!inner(id, full_name, avatar_path)", { count: "exact" });
  if (status) query = query.eq("status", status);
  if (cityLoc) query = query.or(`origin_id.eq.${cityLoc.id},destination_id.eq.${cityLoc.id}`);
  if (data) query = query.eq("is_demo", data === "demo");
  if (q) query = query.ilike("driver.full_name", contains(q));
  const { rows, total } = rowsOf(await query.order("departure_at", { ascending: false }).range(...rangeOf(page)));
  const now = new Date().toISOString();
  const filtered = Boolean(q || status || cityLoc || data);
  const c = { route: d.admin.route, departure: d.admin.departure, driver: d.admin.driver, seats: d.admin.seats, price: d.common.price, status: d.common.status };
  return (
    <div>
      <PageHeader title={d.admin.trips} description={d.admin.tripsSubtitle} />
      <FilterBar action="/admin/trips" active={filtered}>
        <SearchField value={q} placeholder={d.admin.searchTrips} />
        <FilterSelect name="status" defaultValue={status ?? ""} aria-label={d.common.status}>
          <option value="">{d.admin.allStatuses}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{d.status.trip[s]}</option>)}
        </FilterSelect>
        <FilterSelect name="city" defaultValue={cityLoc ? city : ""} aria-label={d.admin.filterCity}>
          <option value="">{d.admin.filterCity}</option>
          {locations.filter((l) => l.kind === "city").map((l) => <option key={l.id} value={l.slug}>{locName(l, locale)}</option>)}
        </FilterSelect>
        <FilterSelect name="data" defaultValue={data ?? ""} aria-label={d.admin.allData}>
          <option value="">{d.admin.allData}</option>
          <option value="real">{d.admin.realOnly}</option>
          <option value="demo">{d.admin.demoOnly}</option>
        </FilterSelect>
      </FilterBar>
      {!rows.length ? <ListEmpty filtered={filtered || page > 1} clearHref="/admin/trips" icon={<Route className="size-6" aria-hidden />} /> : (
        <DataTable head={[c.route, c.departure, c.driver, c.seats, c.price, c.status, d.common.actions]}>
          {rows.map((t) => {
            const key = t.status === "scheduled" && t.departure_at <= now ? "departed" : t.status;
            const route = routeLabel(locName(locs.get(t.origin_id), locale), locName(locs.get(t.destination_id), locale), locale);
            const when = formatDateTime(t.departure_at, locale);
            return (
              <tr key={t.id}>
                <Td primary className="font-semibold"><Link href={`/trips/${t.id}`} className="hover:text-brand-700">{route}</Link></Td>
                <Td label={c.departure} className="text-slate-600">{when}</Td>
                <Td label={c.driver}>{t.driver && <Person id={t.driver.id} name={t.driver.full_name} avatar={t.driver.avatar_path} />}</Td>
                <Td label={c.seats} className="tabular-nums">{t.seats_total - t.seats_available}/{t.seats_total}</Td>
                <Td label={c.price} className="whitespace-nowrap">{formatPrice(Number(t.price_per_seat), locale)}</Td>
                <Td label={c.status}><div className="flex flex-wrap gap-1"><Badge tone={tripTone[key]}>{d.status.trip[key]}</Badge>{t.is_demo && <DemoBadge label={d.common.demo} />}</div></Td>
                <Td actions>
                  <RowActions>
                    <ViewLink href={`/trips/${t.id}`} label={d.common.view} />
                    {t.status === "scheduled" && <CancelTripButton id={t.id} subject={`${route} · ${when}`} />}
                  </RowActions>
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}
      <TablePager page={page} total={total} hrefFor={(p) => listHref("/admin/trips", { q, status, city: cityLoc ? city : null, data, page: p })} />
    </div>
  );
}
