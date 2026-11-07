import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Pencil, Phone, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatPrice, formatTime, plural } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { formatTunisianPhone } from "@/lib/phone";
import { uuidSchema } from "@/lib/validation";
import { cancelTripAction, completeTripAction } from "@/actions/trips";
import { cancelBookingAction, respondBookingAction } from "@/actions/bookings";
import { Avatar } from "@/components/ui/avatar";
import { Badge, bookingTone, tripTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/misc";
import { ConfirmAction } from "@/components/ui/client";
import { ContactButton } from "@/components/trips/contact-button";

export default async function ManageTripPage({ params }: PageProps<"/dashboard/trips/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/trips/${id}`);
  if (!uuidSchema.safeParse(id).success) notFound();
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const locs = await getLocationMap();
  const { data: trip } = await supabase
    .from("trips")
    .select("*, bookings(id, status, seats, total_price, message, created_at, cancellation_reason, passenger:profiles!bookings_passenger_id_fkey(id, full_name, avatar_path, rating_avg, rating_count))")
    .eq("id", id)
    .eq("driver_id", user.id)
    .maybeSingle();
  if (!trip) notFound();
  const { data: contacts } = await supabase.rpc("get_trip_contacts", { p_trip_id: trip.id });
  const phoneOf = new Map((contacts ?? []).map((c) => [c.user_id, c.phone]));

  const departed = new Date(trip.departure_at) <= new Date();
  const active = trip.status === "scheduled";
  const statusKey = active && departed ? "departed" : trip.status;
  const bookings = [...trip.bookings].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const pending = bookings.filter((b) => b.status === "pending");
  const confirmed = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
  const others = bookings.filter((b) => b.status === "cancelled" || b.status === "rejected");
  const expected = confirmed.reduce((s, b) => s + Number(b.total_price), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge tone={tripTone[statusKey]}>{d.status.trip[statusKey]}</Badge>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{routeLabel(locName(locs.get(trip.origin_id), locale), locName(locs.get(trip.destination_id), locale), locale)}</h1>
          <p className="text-slate-500">{formatDate(trip.departure_at, locale, "full")} · {formatTime(trip.departure_at, locale)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/trips/${trip.id}`} className={buttonClass("ghost", "sm")}>{d.driverTrips.viewPublic}</Link>
          {active && !departed && <Link href={`/dashboard/trips/${trip.id}/edit`} className={buttonClass("outline", "sm")}><Pencil className="size-4" aria-hidden />{d.common.edit}</Link>}
          {active && !departed && (
            <ConfirmAction action={cancelTripAction.bind(null, trip.id)} label={d.driverTrips.cancelTrip} title={d.driverTrips.cancelTripTitle} body={d.driverTrips.cancelTripBody} confirmLabel={d.driverTrips.cancelTripConfirm} successMessage={d.driverTrips.tripCancelled} withReason variant="outline" />
          )}
          {active && departed && (
            <ConfirmAction action={completeTripAction.bind(null, trip.id)} label={d.driverTrips.markCompleted} title={d.driverTrips.markCompletedTitle} body={d.driverTrips.markCompletedBody} successMessage={d.driverTrips.completedToast} variant="primary" confirmVariant="primary" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={d.trip.seatsAvailable} value={`${trip.seats_available}/${trip.seats_total}`} />
        <StatCard label={d.trip.pricePerSeat} value={formatPrice(Number(trip.price_per_seat), locale)} />
        <StatCard label={d.driverTrips.requests} value={pending.length} tone="accent" />
        <StatCard label={d.driverTrips.expected} value={formatPrice(expected, locale)} tone="slate" />
      </div>

      {active && (
        <Card>
          <CardHeader title={d.driverTrips.requests} />
          {pending.length ? (
            <ul className="divide-y divide-slate-100">
              {pending.map((b) => (
                <li key={b.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                  <PassengerCell p={b.passenger} d={d} extra={`${plural(d.units.seats, b.seats, locale)} · ${formatPrice(Number(b.total_price), locale)} · ${formatDateTime(b.created_at, locale)}`} />
                  {b.message && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 sm:max-w-xs"><span className="block text-xs font-semibold text-slate-400">{d.driverTrips.passengerMessage}</span>{b.message}</p>}
                  {!departed && (
                    <div className="flex gap-2">
                      <ConfirmAction action={respondBookingAction.bind(null, b.id, trip.id, true)} label={d.driverTrips.accept} icon={<CheckCircle2 className="size-4" />} successMessage={d.driverTrips.accepted} variant="primary" skipConfirm />
                      <ConfirmAction action={respondBookingAction.bind(null, b.id, trip.id, false)} label={d.driverTrips.reject} icon={<XCircle className="size-4" />} title={d.driverTrips.rejectTitle} body={d.driverTrips.rejectBody} confirmLabel={d.driverTrips.reject} successMessage={d.driverTrips.rejected} variant="outline" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-6 text-sm text-slate-500 sm:px-6">{d.driverTrips.noRequests}</p>}
        </Card>
      )}

      <Card>
        <CardHeader title={d.driverTrips.passengers} />
        {confirmed.length ? (
          <ul className="divide-y divide-slate-100">
            {confirmed.map((b) => {
              const phone = phoneOf.get(b.passenger?.id ?? "");
              return (
                <li key={b.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                  <PassengerCell p={b.passenger} d={d} extra={`${plural(d.units.seats, b.seats, locale)} · ${formatPrice(Number(b.total_price), locale)}`} />
                  <Badge tone={bookingTone[b.status]}>{d.status.booking[b.status]}</Badge>
                  <div className="flex flex-wrap gap-2">
                    {phone && <a href={`tel:${phone}`} className={buttonClass("outline", "sm")} dir="ltr"><Phone className="size-4" aria-hidden />{formatTunisianPhone(phone)}</a>}
                    {b.passenger && <ContactButton tripId={trip.id} passengerId={b.passenger.id} label={d.driverTrips.message} size="sm" />}
                    {active && !departed && b.status === "confirmed" && (
                      <ConfirmAction action={cancelBookingAction.bind(null, b.id)} label={d.driverTrips.removePassenger} title={d.driverTrips.removePassengerTitle} body={d.driverTrips.removePassengerBody} successMessage={d.bookings.cancelled} withReason variant="ghost" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="px-5 py-6 text-sm text-slate-500 sm:px-6">{d.driverTrips.noPassengers}</p>}
      </Card>

      {others.length > 0 && (
        <Card>
          <CardHeader title={d.driverTrips.history} />
          <ul className="divide-y divide-slate-100">
            {others.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
                <PassengerCell p={b.passenger} d={d} extra={plural(d.units.seats, b.seats, locale)} />
                <Badge tone={bookingTone[b.status]}>{d.status.booking[b.status]}</Badge>
                {b.cancellation_reason && <span className="text-sm italic text-slate-500">“{b.cancellation_reason}”</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {trip.cancellation_reason && <p className="text-sm text-slate-500">{d.status.trip.cancelled}: “{trip.cancellation_reason}”</p>}
    </div>
  );
}

function PassengerCell({ p, d, extra }: { p: { id: string; full_name: string; avatar_path: string | null; rating_avg: number; rating_count: number } | null; d: Awaited<ReturnType<typeof getI18n>>["d"]; extra: string }) {
  if (!p) return null;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar path={p.avatar_path} name={p.full_name} />
      <div className="min-w-0">
        <Link href={`/users/${p.id}`} className="block truncate font-semibold hover:text-brand-700">{p.full_name}</Link>
        <p className="text-sm text-slate-500">{p.rating_count ? `★ ${Number(p.rating_avg).toFixed(1)} · ` : `${d.trip.newMember} · `}{extra}</p>
      </div>
    </div>
  );
}
