import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Car, Cigarette, CigaretteOff, Clock, Dog, Luggage, MessageSquare, Music, Route, Users, VolumeX } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getUser } from "@/lib/auth";
import { getLocationMap } from "@/lib/locations";
import { createClient } from "@/lib/supabase/server";
import { fmt, formatDate, formatDuration, formatPrice, formatTime, plural } from "@/lib/i18n/format";
import { addressDetail, locName, vehicleName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import { publicUrl } from "@/lib/storage";
import { uuidSchema } from "@/lib/validation";
import { RouteMap } from "@/components/map";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { BookingPanel } from "@/components/trips/booking-panel";
import { DriverContact } from "@/components/trips/driver-contact";
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

  const [{ data: passengers }, myBookingRes, contactsRes, profileCompleteRes] = await Promise.all([
    supabase.rpc("get_trip_passengers_public", { p_trip_id: trip.id }),
    user && !isOwner
      ? supabase.from("bookings").select("id, status, seats, total_price").eq("trip_id", trip.id).eq("passenger_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    user ? supabase.rpc("get_trip_contacts", { p_trip_id: trip.id }) : Promise.resolve({ data: null }),
    user && !isOwner ? supabase.rpc("my_profile_complete") : Promise.resolve({ data: null }),
  ]);
  const myBooking = myBookingRes.data && ["pending", "confirmed", "completed"].includes(myBookingRes.data.status) ? myBookingRes.data : null;
  const driverContact = (contactsRes.data ?? []).find((c) => c.role === "driver");
  // Passengers get it as soon as they book, pending or confirmed (migration 18); other
  // signed-in members only if the driver opted in (migration 17). Guests never: the RPC is
  // not granted to anon.
  const publicPhone = user && !isOwner && !driverContact?.phone
    ? (await supabase.rpc("get_public_driver_phones", { p_driver_ids: [trip.driver_id] })).data?.[0]?.phone ?? null
    : null;
  const driverPhone = driverContact?.phone ?? publicPhone;
  const wasRejected = myBookingRes.data?.status === "rejected";

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
      <Link href="/search" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-brand-700"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{d.nav.search}</Link>
      {trip.is_demo && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="note">
          <DemoBadge label={d.common.demo} />{d.trip.demoNotice}
        </div>
      )}
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{routeLabel(locName(origin, locale), locName(destination, locale), locale)}</h1>
      <p className="mt-1 flex items-center gap-2 text-slate-600"><CalendarDays className="size-4" aria-hidden />{formatDate(trip.departure_at, locale, "full")}</p>

      {/* Phones: route, then contact + booking, then the details. Desktop: booking stays in a side column. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
        <div className="lg:col-start-1">
          <Card className="p-5 sm:p-6">
            <ol className="relative space-y-6 ps-8">
              <span className="absolute inset-y-2 start-[11px] w-0.5 bg-slate-200" aria-hidden />
              <li className="relative">
                <span className="absolute -start-8 top-1 size-6 rounded-full border-4 border-brand-600 bg-white" aria-hidden />
                <p className="text-2xl font-bold tabular-nums">{formatTime(trip.departure_at, locale)}</p>
                <p className="text-lg font-bold">{locName(origin, locale)}</p>
                {addressDetail(trip.origin_address, origin) && <p className="text-sm text-slate-500">{d.trip.pickup}: {trip.origin_address}</p>}
              </li>
              <li className="relative">
                <span className="absolute -start-8 top-1 size-6 rounded-full border-4 border-accent-500 bg-white" aria-hidden />
                {arrival && <p className="text-2xl font-bold tabular-nums">{formatTime(arrival, locale)}</p>}
                <p className="text-lg font-bold">{locName(destination, locale)}</p>
                {addressDetail(trip.destination_address, destination) && <p className="text-sm text-slate-500">{d.trip.dropoff}: {trip.destination_address}</p>}
              </li>
            </ol>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
              {trip.distance_km ? <span className="flex items-center gap-1.5"><Route className="size-4" aria-hidden />{fmt(d.units.km, { count: Number(trip.distance_km) })}</span> : null}
              {trip.duration_min ? <span className="flex items-center gap-1.5"><Clock className="size-4" aria-hidden />{formatDuration(trip.duration_min, locale)}</span> : null}
              <span className="flex items-center gap-1.5 font-semibold text-brand-800"><Users className="size-4" aria-hidden />{trip.seats_available > 0 ? plural(d.units.seatsLeft, trip.seats_available, locale) : d.search.full}</span>
              <span className="flex items-center gap-1.5"><Luggage className="size-4" aria-hidden />{d.trip.luggageSizes[trip.luggage_size]}</span>
            </div>
          </Card>

        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <DriverContact
            d={d}
            locale={locale}
            tripId={trip.id}
            driver={driver}
            phone={driverPhone}
            plate={driverContact?.plate_number}
            viewer={isOwner ? "owner" : user ? "member" : "guest"}
            confirmed={Boolean(driverContact)}
            active={trip.status === "scheduled" && !departed}
          />
          <Card id="book" className="scroll-mt-24 p-5">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-3xl font-extrabold text-brand-700">{formatPrice(Number(trip.price_per_seat), locale)}</p>
                <p className="text-sm text-slate-500">{d.common.perSeat}</p>
              </div>
              <p className="text-sm font-semibold text-brand-700">{trip.seats_available > 0 ? plural(d.units.seatsLeft, trip.seats_available, locale) : d.search.full}</p>
            </div>
            <BookingPanel
              tripId={trip.id}
              price={Number(trip.price_per_seat)}
              seatsAvailable={trip.seats_available}
              state={state}
              wasRejected={wasRejected}
              needsProfile={profileCompleteRes.data === false}
              driverPhone={driverPhone}
              initialSeats={Number(typeof sp.seats === "string" ? sp.seats : 1) || 1}
              booking={myBooking ? { id: myBooking.id, status: myBooking.status, seats: myBooking.seats, total: Number(myBooking.total_price) } : null}
            />
          </Card>
        </aside>

        <div className="space-y-6 lg:col-start-1">
          <Card className="overflow-hidden">
            <div className="h-72 sm:h-80">
              <RouteMap className="h-full w-full" origin={{ lat: trip.origin_lat, lng: trip.origin_lng }} destination={{ lat: trip.destination_lat, lng: trip.destination_lng }} />
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-semibold">{d.trip.preferences}</h2>
                {driver.trips_driven > 0 && <p className="mt-1 text-sm text-slate-500">{plural(d.trip.tripsDriven, driver.trips_driven, locale)}</p>}
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
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold"><Car className="size-5 text-brand-600" aria-hidden />{d.trip.vehicle}</h2>
            {trip.vehicle ? (
              <div className="mt-3 flex items-center gap-4">
                {photo && <Image src={publicUrl("vehicles", photo)!} alt="" width={120} height={80} className="h-20 w-28 rounded-xl object-cover" />}
                <p className="text-slate-700">{[vehicleName(trip.vehicle), trip.vehicle.color, trip.vehicle.year].filter(Boolean).join(" · ")}</p>
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

      </div>

      {(state === "bookable" || state === "guest") && !myBooking && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold leading-tight text-brand-700">{formatPrice(Number(trip.price_per_seat), locale)}</p>
            <p className="truncate text-xs text-slate-500">{plural(d.units.seatsLeft, trip.seats_available, locale)}</p>
          </div>
          <a href="#book" className={buttonClass("primary", "lg", "h-12 px-7")}>{d.trip.bookNow}</a>
        </div>
      )}
    </div>
  );
}
