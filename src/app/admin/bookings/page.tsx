import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatPrice } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { contains, oneOf, pageParam, rangeOf, rowsOf, textParam } from "@/lib/admin";
import { PageHeader } from "@/components/ui/card";
import { Badge, DemoBadge, bookingTone } from "@/components/ui/badge";
import { DataTable, FilterBar, ListEmpty, listHref, Person, RowActions, SearchField, TablePager, Td, ViewLink } from "@/components/admin/table";
import { FilterSelect } from "@/components/admin/filter-select";
import { CancelBookingButton } from "@/components/admin/admin-actions";

const STATUSES = ["pending", "confirmed", "rejected", "cancelled", "completed"] as const;

export default async function AdminBookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const sp = await searchParams;
  const q = textParam(sp.q);
  const status = oneOf(sp.status, STATUSES);
  const data = oneOf(sp.data, ["real", "demo"] as const);
  const page = pageParam(sp.page);
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locs = await getLocationMap();
  let query = supabase.from("bookings").select("id, status, seats, total_price, created_at, is_demo, passenger:profiles!bookings_passenger_id_fkey!inner(id, full_name, avatar_path), trip:trips!bookings_trip_id_fkey(id, departure_at, origin_id, destination_id, driver:profiles!trips_driver_id_fkey(id, full_name, avatar_path))", { count: "exact" });
  if (status) query = query.eq("status", status);
  if (data) query = query.eq("is_demo", data === "demo");
  if (q) query = query.ilike("passenger.full_name", contains(q));
  const { rows, total } = rowsOf(await query.order("created_at", { ascending: false }).range(...rangeOf(page)));
  const filtered = Boolean(q || status || data);
  const c = { route: d.admin.route, passenger: d.admin.passenger, driver: d.admin.driver, seats: d.admin.seats, total: d.common.total, status: d.common.status };
  return (
    <div>
      <PageHeader title={d.admin.bookings} description={d.admin.bookingsSubtitle} />
      <FilterBar action="/admin/bookings" active={filtered}>
        <SearchField value={q} placeholder={d.admin.searchBookings} />
        <FilterSelect name="status" defaultValue={status ?? ""} aria-label={d.common.status}>
          <option value="">{d.admin.allStatuses}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{d.status.booking[s]}</option>)}
        </FilterSelect>
        <FilterSelect name="data" defaultValue={data ?? ""} aria-label={d.admin.allData}>
          <option value="">{d.admin.allData}</option>
          <option value="real">{d.admin.realOnly}</option>
          <option value="demo">{d.admin.demoOnly}</option>
        </FilterSelect>
      </FilterBar>
      {!rows.length ? <ListEmpty filtered={filtered || page > 1} clearHref="/admin/bookings" icon={<CalendarCheck className="size-6" aria-hidden />} /> : (
        <DataTable head={[c.route, c.passenger, c.driver, c.seats, c.total, c.status, d.common.actions]}>
          {rows.map((b) => {
            const route = b.trip ? routeLabel(locName(locs.get(b.trip.origin_id), locale), locName(locs.get(b.trip.destination_id), locale), locale) : "";
            return (
              <tr key={b.id}>
                <Td primary>
                  {b.trip && <><Link href={`/trips/${b.trip.id}`} className="font-semibold hover:text-brand-700">{route}</Link><span className="mt-0.5 block text-xs text-slate-500">{formatDateTime(b.trip.departure_at, locale)}</span></>}
                </Td>
                <Td label={c.passenger}>{b.passenger && <Person id={b.passenger.id} name={b.passenger.full_name} avatar={b.passenger.avatar_path} />}</Td>
                <Td label={c.driver}>{b.trip?.driver && <Person id={b.trip.driver.id} name={b.trip.driver.full_name} avatar={b.trip.driver.avatar_path} />}</Td>
                <Td label={c.seats} className="tabular-nums">{b.seats}</Td>
                <Td label={c.total} className="whitespace-nowrap">{formatPrice(Number(b.total_price), locale)}</Td>
                <Td label={c.status}><div className="flex flex-wrap gap-1"><Badge tone={bookingTone[b.status]}>{d.status.booking[b.status]}</Badge>{b.is_demo && <DemoBadge label={d.common.demo} />}</div></Td>
                <Td actions>
                  <RowActions>
                    {b.trip && <ViewLink href={`/trips/${b.trip.id}`} label={d.common.view} />}
                    {(b.status === "pending" || b.status === "confirmed") && <CancelBookingButton id={b.id} subject={`${b.passenger?.full_name ?? ""} · ${route}`} />}
                  </RowActions>
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}
      <TablePager page={page} total={total} hrefFor={(p) => listHref("/admin/bookings", { q, status, data, page: p })} />
    </div>
  );
}
