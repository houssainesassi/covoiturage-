import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDateTime, formatPrice } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import type { BookingStatus } from "@/lib/supabase/database.types";
import { PageHeader } from "@/components/ui/card";
import { Badge, bookingTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/misc";
import { FilterBar, Table } from "@/components/admin/table";
import { CancelBookingButton } from "@/components/admin/admin-actions";

const PAGE = 25;
const STATUSES: BookingStatus[] = ["pending", "confirmed", "rejected", "cancelled", "completed"];

export default async function AdminBookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as BookingStatus) ? (sp.status as BookingStatus) : null;
  const page = Math.max(Number(sp.page) || 1, 1);
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locs = await getLocationMap();
  let q = supabase.from("bookings").select("id, status, seats, total_price, created_at, passenger:profiles!bookings_passenger_id_fkey(id, full_name), trip:trips!bookings_trip_id_fkey(id, departure_at, origin_id, destination_id, driver:profiles!trips_driver_id_fkey(id, full_name))", { count: "exact" });
  if (status) q = q.eq("status", status);
  const { data, count } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const totalPages = Math.ceil((count ?? 0) / PAGE);
  return (
    <div>
      <PageHeader title={d.admin.bookings} />
      <FilterBar>
        <Select name="status" defaultValue={status ?? ""} className="w-auto" aria-label={d.common.status}><option value="">{d.admin.allStatuses}</option>{STATUSES.map((s) => <option key={s} value={s}>{d.status.booking[s]}</option>)}</Select>
        <Button type="submit" variant="outline">{d.common.apply}</Button>
      </FilterBar>
      <Table head={[d.admin.route, d.admin.passenger, d.admin.driver, d.admin.seats, d.common.total, d.common.status, d.common.actions]} empty={!data?.length && <p className="p-6 text-center text-sm text-slate-500">{d.admin.empty}</p>}>
        {(data ?? []).map((b) => (
          <tr key={b.id}>
            <td className="px-4 py-3">{b.trip && <Link href={`/trips/${b.trip.id}`} className="font-medium hover:text-brand-700">{routeLabel(locName(locs.get(b.trip.origin_id), locale), locName(locs.get(b.trip.destination_id), locale), locale)}</Link>}<br /><span className="text-xs text-slate-500">{b.trip && formatDateTime(b.trip.departure_at, locale)}</span></td>
            <td className="px-4 py-3">{b.passenger && <Link href={`/users/${b.passenger.id}`} className="hover:text-brand-700">{b.passenger.full_name}</Link>}</td>
            <td className="px-4 py-3">{b.trip?.driver && <Link href={`/users/${b.trip.driver.id}`} className="hover:text-brand-700">{b.trip.driver.full_name}</Link>}</td>
            <td className="px-4 py-3">{b.seats}</td>
            <td className="px-4 py-3">{formatPrice(Number(b.total_price), locale)}</td>
            <td className="px-4 py-3"><Badge tone={bookingTone[b.status]}>{d.status.booking[b.status]}</Badge></td>
            <td className="px-4 py-3">{(b.status === "pending" || b.status === "confirmed") && <CancelBookingButton id={b.id} />}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/admin/bookings?${new URLSearchParams({ ...(status && { status }), page: String(p) })}`} labels={{ previous: d.common.previous, next: d.common.next, pageOf: fmt(d.common.pageOf, { page, total: totalPages }) }} />
    </div>
  );
}
