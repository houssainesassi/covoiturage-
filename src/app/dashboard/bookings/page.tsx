import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDate, formatDateTime, formatPrice, formatTime, plural } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { cancelBookingAction } from "@/actions/bookings";
import { PageHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge, bookingTone } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState, Tabs } from "@/components/ui/misc";
import { ConfirmAction } from "@/components/ui/client";
import { ContactButton } from "@/components/trips/contact-button";

export default async function BookingsPage({ searchParams }: PageProps<"/dashboard/bookings">) {
  const user = await requireUser("/dashboard/bookings");
  const tab = (await searchParams).tab === "history" ? "history" : "upcoming";
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locs = await getLocationMap();
  const now = new Date().toISOString();

  let q = supabase
    .from("bookings")
    .select("id, status, seats, total_price, created_at, cancellation_reason, trip:trips!bookings_trip_id_fkey!inner(id, departure_at, origin_id, destination_id, origin_address, status, driver:profiles!trips_driver_id_fkey(id, full_name, avatar_path))")
    .eq("passenger_id", user.id);
  q = tab === "upcoming"
    ? q.in("status", ["pending", "confirmed"]).gt("trip.departure_at", now).order("created_at", { ascending: false })
    : q.order("created_at", { ascending: false }).limit(100);
  const [{ data: raw }, { data: pending }] = await Promise.all([q, supabase.rpc("pending_reviews")]);
  const bookings = tab === "upcoming" ? raw : (raw ?? []).filter((b) => !["pending", "confirmed"].includes(b.status) || b.trip!.departure_at <= now);
  const toReview = new Set((pending ?? []).filter((p) => p.reviewee_role === "driver").map((p) => p.trip_id));

  return (
    <div>
      <PageHeader title={d.bookings.title} action={<ButtonLink href="/search" variant="outline">{d.dashboard.findRide}</ButtonLink>} />
      <Tabs active={tab} tabs={[{ key: "upcoming", label: d.bookings.upcoming, href: "/dashboard/bookings" }, { key: "history", label: d.bookings.history, href: "/dashboard/bookings?tab=history" }]} />
      {!(bookings ?? []).length ? (
        <EmptyState icon={<CalendarCheck className="size-6" />} title={tab === "upcoming" ? d.bookings.emptyUpcoming : d.bookings.emptyHistory} action={<ButtonLink href="/search">{d.dashboard.findRide}</ButtonLink>} />
      ) : (
        <ul className="space-y-4">
          {bookings!.map((b) => {
            const t = b.trip!;
            const active = ["pending", "confirmed"].includes(b.status) && t.departure_at > now;
            return (
              <li key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{formatDate(t.departure_at, locale)} · {formatTime(t.departure_at, locale)}</p>
                    <Link href={`/trips/${t.id}`} className="mt-1 block text-lg font-bold hover:text-brand-700">{routeLabel(locName(locs.get(t.origin_id), locale), locName(locs.get(t.destination_id), locale), locale)}</Link>
                    <p className="text-sm text-slate-500">{t.origin_address}</p>
                  </div>
                  <Badge tone={bookingTone[b.status]}>{d.status.booking[b.status]}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm">
                  {t.driver && <Link href={`/users/${t.driver.id}`} className="flex items-center gap-2 font-medium"><Avatar path={t.driver.avatar_path} name={t.driver.full_name} size="xs" />{t.driver.full_name}</Link>}
                  <span className="text-slate-600">{plural(d.units.seats, b.seats, locale)} · <strong>{formatPrice(Number(b.total_price), locale)}</strong></span>
                  <span className="text-slate-400">{fmt(d.bookings.requestedOn, { date: formatDateTime(b.created_at, locale) })}</span>
                </div>
                {b.status === "pending" && active && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{d.bookings.pendingHint}</p>}
                {b.cancellation_reason && <p className="mt-3 text-sm italic text-slate-500">“{b.cancellation_reason}”</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/trips/${t.id}`} className={buttonClass("ghost", "sm")}>{d.bookings.viewTrip}</Link>
                  {active && <ContactButton tripId={t.id} label={d.bookings.messageDriver} size="sm" />}
                  {active && (
                    <ConfirmAction action={cancelBookingAction.bind(null, b.id)} label={d.bookings.cancel} title={d.bookings.cancelTitle} body={`${d.bookings.cancelBody}`} confirmLabel={d.bookings.confirmCancel} successMessage={d.bookings.cancelled} withReason variant="outline" />
                  )}
                  {b.status === "completed" && toReview.has(t.id) && <ButtonLink href="/dashboard/reviews" size="sm" variant="secondary">{d.bookings.leaveReview}</ButtonLink>}
                  {b.status === "completed" && !toReview.has(t.id) && <Badge tone="neutral">{d.bookings.reviewed}</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-center text-xs text-slate-500">{d.bookings.cancelRule}</p>
    </div>
  );
}
