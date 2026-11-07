import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CalendarDays, Car, Cigarette, CigaretteOff, Clock, Dog, Luggage, MessageSquare, Music, Phone, Route, ShieldCheck, Star, VolumeX } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDate, formatDuration, formatPrice, formatTime, plural } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { formatTunisianPhone } from "@/lib/phone";
import { publicUrl } from "@/lib/storage";
import { uuidSchema } from "@/lib/validation";
import { RouteMap } from "@/components/map";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { BookingPanel } from "@/components/trips/booking-panel";
import { ContactButton } from "@/components/trips/contact-button";
import { ReportDialog } from "@/components/report/report-dialog";
import { buttonClass } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/badge";

async function load(id: string) {
  if (!uuidSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("trips")
    .select("*, driver:profiles!trips_driver_id_fkey(id, full_name, avatar_path, rating_avg, rating_count, trips_driven, bio, created_at, pref_smoking, pref_pets, pref_music, pref_chatty, status), vehicle:vehicles!trips_vehicle_id_fkey(type, brand, model, color, year, photo_paths)")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/trips/[id]">): Promise<Metadata> {
  const { id } = await params;
  const { d, locale } = await getI18n();
  const trip = await load(id);
  if (!trip) return { title: d.notFound.title };
  const locs = await getLocationMap();
  return { title: fmt(d.trip.shareTitle, { from: locName(locs.get(trip.origin_id), locale), to: locName(locs.get(trip.destination_id), locale), date: formatDate(trip.departure_at, locale, "short") }) };
}

export default async function TripPage({ params, searchParams }: PageProps<"/trips/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const trip = await load(id);
  if (!trip || !trip.driver) notFound();
  const { d, locale } = await getI18n();
  const locs = await getLocationMap();
  const user = await getUser();
  const supabase = await createClient();
  const origin = locs.get(trip.origin_id);
  const destination = locs.get(trip.destination_id);
  const driver = trip.driver;
  const isOwner = user?.id === trip.driver_id;

  const [{ data: passengers }, myBookingRes, contactsRes] = await Promise.all([
    supabase.rpc("get_trip_passengers_public", { p_trip_id: trip.id }),
    user && !isOwner
      ? supabase.from("bookings").select("id, status, seats, total_price").eq("trip_id", trip.id).eq("passenger_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    user ? supabase.rpc("get_trip_contacts", { p_trip_id: trip.id }) : Promise.resolve({ data: null }),
  ]);
  const myBooking = myBookingRes.data && ["pending", "confirmed", "completed"].includes(myBookingRes.data.status) ? myBookingRes.data : null;
  const driverContact = (contactsRes.data ?? []).find((c) => c.role === "driver");

  const departed = new Date(trip.departure_at) <= new Date();
  const state = isOwner ? "own"
    : trip.status === "cancelled" ? "cancelled"
    : trip.status === "completed" ? "completed"
    : departed ? "departed"
    : trip.seats_available <= 0 ? "full"
    : user ? "bookable" : "guest";

  const arrival = trip.duration_min ? new Date(new Date(trip.departure_at).getTime() + trip.duration_min * 60000) : null;
  const prefs = [
    driver.pref_smoking ? { icon: Cigarette, label: d.trip.prefs.smokingYes } : { icon: CigaretteOff, label: d.trip.prefs.smokingNo },
    driver.pref_pets ? { icon: Dog, label: d.trip.prefs.petsYes } : { icon: Dog, label: d.trip.prefs.petsNo },
    driver.pref_music ? { icon: Music, label: d.trip.prefs.musicYes } : { icon: VolumeX, label: d.trip.prefs.musicNo },
    { icon: MessageSquare, label: driver.pref_chatty ? d.trip.prefs.chattyYes : d.trip.prefs.chattyNo },
  ];
  const photo = trip.vehicle?.photo_paths?.[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/search" className="text-sm font-medium text-slate-500 hover:text-brand-700">← {d.nav.search}</Link>
      {trip.is_demo && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="note">
          <DemoBadge label={d.common.demo} />{d.trip.demoNotice}
        </div>
      )}
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{routeLabel(locName(origin, locale), locName(destination, locale), locale)}</h1>
      <p className="mt-1 flex items-center gap-2 text-slate-600"><CalendarDays className="size-4" aria-hidden />{formatDate(trip.departure_at, locale, "full")}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <ol className="relative space-y-6 ps-8">
              <span className="absolute inset-y-2 start-[11px] w-0.5 bg-slate-200" aria-hidden />
              <li className="relative">
                <span className="absolute -start-8 top-1 size-6 rounded-full border-4 border-brand-600 bg-white" aria-hidden />
                <p className="text-2xl font-bold tabular-nums">{formatTime(trip.departure_at, locale)}</p>
                <p className="font-semibold">{locName(origin, locale)}</p>
                <p className="text-sm text-slate-500">{d.trip.pickup}: {trip.origin_address}</p>
              </li>
              <li className="relative">
                <span className="absolute -start-8 top-1 size-6 rounded-full border-4 border-accent-500 bg-white" aria-hidden />
                <p className="text-2xl font-bold tabular-nums">{arrival ? formatTime(arrival, locale) : "—"}</p>
                <p className="font-semibold">{locName(destination, locale)}</p>
                <p className="text-sm text-slate-500">{d.trip.dropoff}: {trip.destination_address}</p>
              </li>
            </ol>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
              {trip.distance_km ? <span className="flex items-center gap-1.5"><Route className="size-4" aria-hidden />{fmt(d.units.km, { count: Number(trip.distance_km) })}</span> : null}
              {trip.duration_min ? <span className="flex items-center gap-1.5"><Clock className="size-4" aria-hidden />{formatDuration(trip.duration_min, locale)}</span> : null}
              <span className="flex items-center gap-1.5"><Luggage className="size-4" aria-hidden />{d.trip.luggageSizes[trip.luggage_size]}</span>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="h-72 sm:h-80">
              <RouteMap className="h-full w-full" origin={{ lat: trip.origin_lat, lng: trip.origin_lng }} destination={{ lat: trip.destination_lat, lng: trip.destination_lng }} />
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <Avatar path={driver.avatar_path} name={driver.full_name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{d.trip.driver}</p>
                <Link href={`/users/${driver.id}`} className="text-lg font-bold hover:text-brand-700">{driver.full_name || d.common.unknownUser}</Link>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                  {driver.rating_count > 0 ? <span className="flex items-center gap-1"><Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />{fmt(d.trip.ratingLine, { rating: Number(driver.rating_avg).toFixed(1), count: plural(d.units.reviews, driver.rating_count, locale) })}</span> : <span>{d.trip.newMember}</span>}
                  <span>· {plural(d.trip.tripsDriven, driver.trips_driven, locale)}</span>
                </p>
                {driver.bio && <p className="mt-3 text-sm text-slate-600">{driver.bio}</p>}
              </div>
              {user && !isOwner && <ReportDialog userId={driver.id} name={driver.full_name} tripId={trip.id} compact />}
            </div>
            <ul className="mt-5 grid grid-cols-2 gap-2 text-sm text-slate-600">
              {prefs.map((p) => <li key={p.label} className="flex items-center gap-2"><p.icon className="size-4 text-slate-400" aria-hidden />{p.label}</li>)}
            </ul>
            {trip.description && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h2 className="font-semibold">{d.trip.about}</h2>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{trip.description}</p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Link href={`/users/${driver.id}`} className={buttonClass("ghost", "sm")}>{d.trip.viewProfile}</Link>
              {!isOwner && trip.status === "scheduled" && (user ? <ContactButton tripId={trip.id} label={d.trip.contactDriver} size="sm" /> : <Link href={`/auth/login?next=/trips/${trip.id}`} className={buttonClass("outline", "sm")}>{d.trip.contactDriver}</Link>)}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold"><Car className="size-5 text-brand-600" aria-hidden />{d.trip.vehicle}</h2>
            {trip.vehicle ? (
              <div className="mt-3 flex items-center gap-4">
                {photo && <Image src={publicUrl("vehicles", photo)!} alt="" width={120} height={80} className="h-20 w-28 rounded-xl object-cover" />}
                <p className="text-slate-700">{trip.vehicle.brand} {trip.vehicle.model} · {trip.vehicle.color}{trip.vehicle.year ? ` · ${trip.vehicle.year}` : ""}</p>
              </div>
            ) : <p className="mt-2 text-sm text-slate-500">{d.trip.noVehicle}</p>}
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-semibold">{d.trip.passengersOnBoard}</h2>
            {(passengers ?? []).length ? (
              <ul className="mt-3 flex flex-wrap gap-3">
                {passengers!.map((p) => (
                  <li key={p.user_id}><Link href={`/users/${p.user_id}`} className="flex items-center gap-2 rounded-full bg-slate-50 py-1 pe-3 ps-1 text-sm hover:bg-slate-100"><Avatar path={p.avatar_path} name={p.full_name} size="sm" />{p.full_name}{p.seats > 1 ? ` ×${p.seats}` : ""}</Link></li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-500">{d.trip.noPassengersYet}</p>}
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="text-3xl font-extrabold">{formatPrice(Number(trip.price_per_seat), locale)}</p>
                <p className="text-sm text-slate-500">{d.common.perSeat}</p>
              </div>
              <p className="text-sm font-semibold text-brand-700">{trip.seats_available > 0 ? plural(d.units.seatsLeft, trip.seats_available, locale) : d.search.full}</p>
            </div>
            <BookingPanel
              tripId={trip.id}
              price={Number(trip.price_per_seat)}
              seatsAvailable={trip.seats_available}
              state={state}
              initialSeats={Number(typeof sp.seats === "string" ? sp.seats : 1) || 1}
              booking={myBooking ? { id: myBooking.id, status: myBooking.status, seats: myBooking.seats, total: Number(myBooking.total_price) } : null}
            />
          </Card>
          {myBooking && (
            <Card className="mt-4 p-5">
              <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-brand-600" aria-hidden />{d.trip.contactTitle}</h2>
              {driverContact ? (
                <dl className="mt-3 space-y-2 text-sm">
                  {driverContact.phone && <div className="flex justify-between gap-3"><dt className="text-slate-500">{d.trip.phone}</dt><dd><a href={`tel:${driverContact.phone}`} className="flex items-center gap-1 font-semibold text-brand-700" dir="ltr"><Phone className="size-4" aria-hidden />{formatTunisianPhone(driverContact.phone)}</a></dd></div>}
                  {driverContact.plate_number && <div className="flex justify-between gap-3"><dt className="text-slate-500">{d.trip.plate}</dt><dd className="font-semibold">{driverContact.plate_number}</dd></div>}
                </dl>
              ) : <p className="mt-2 text-sm text-slate-500">{d.trip.contactHidden}</p>}
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
