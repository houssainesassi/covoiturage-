import Link from "next/link";
import { CalendarDays, Car, Clock, Phone, Star, Users } from "lucide-react";
import { formatTunisianPhone } from "@/lib/phone";
import { Avatar } from "@/components/ui/avatar";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";
import { formatDate, formatDuration, formatPrice, formatTime, plural } from "@/lib/i18n/format";
import { addressDetail, locName } from "@/lib/names";
import { routeLabel } from "@/lib/notifications";
import type { Location } from "@/lib/supabase/database.types";

export type TripCardData = {
  id: string;
  departure_at: string;
  price_per_seat: number;
  seats_available: number;
  origin_id: string;
  destination_id: string;
  origin_address: string;
  destination_address: string;
  duration_min: number | null;
  driver_id?: string;
  driver_phone?: string | null;
  driver_name: string;
  driver_avatar_path: string | null;
  driver_rating: number;
  driver_rating_count: number;
  vehicle: string | null;
  isDemo?: boolean;
  status?: "scheduled" | "cancelled" | "completed";
};

export function TripCard({ trip, locations, d, locale }: { trip: TripCardData; locations: Map<string, Location>; d: Dictionary; locale: Locale }) {
  const originLoc = locations.get(trip.origin_id);
  const destinationLoc = locations.get(trip.destination_id);
  const origin = locName(originLoc, locale);
  const destination = locName(destinationLoc, locale);
  const originDetail = addressDetail(trip.origin_address, originLoc);
  const destinationDetail = addressDetail(trip.destination_address, destinationLoc);
  const arrival = trip.duration_min ? new Date(new Date(trip.departure_at).getTime() + trip.duration_min * 60000) : null;
  const full = trip.seats_available <= 0;
  const open = (!trip.status || trip.status === "scheduled") && !trip.isDemo;
  const bookable = open && !full;
  const href = `/trips/${trip.id}`;
  return (
    // The route link stretches over the card; the buttons sit above it so they stay separate tap targets.
    <article className="group relative flex flex-col rounded-[var(--radius-card)] border border-slate-200/80 bg-white p-4 shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-lift)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            {formatDate(trip.departure_at, locale)}
          </span>
          {trip.isDemo && <DemoBadge label={d.common.demo} />}
          {trip.status === "completed" && <Badge>{d.status.trip.completed}</Badge>}
        </div>
        <p className="shrink-0 text-end leading-none">
          <span className="block text-2xl font-extrabold tracking-tight text-slate-900">{formatPrice(trip.price_per_seat, locale)}</span>
          <span className="mt-1 block text-[11px] font-medium text-slate-500">{d.common.perSeat}</span>
        </p>
      </div>

      <Link href={href} aria-label={routeLabel(origin, destination, locale)} className="mt-3 grid grid-cols-[3.25rem_1rem_minmax(0,1fr)] gap-x-2 after:absolute after:inset-0 after:rounded-[var(--radius-card)] after:content-['']">
        <span className="pt-0.5 text-[15px] font-extrabold tabular-nums text-slate-900">{formatTime(trip.departure_at, locale)}</span>
        <span className="flex flex-col items-center pt-1.5" aria-hidden>
          <span className="size-3 shrink-0 rounded-full border-[3px] border-brand-600 bg-white" />
          <span className="my-1 w-0.5 flex-1 rounded-full bg-gradient-to-b from-brand-300 to-accent-300" />
        </span>
        <span className="min-w-0 pb-3">
          <span className="block truncate text-base font-bold text-slate-900">{origin}</span>
          {originDetail && <span className="block truncate text-sm text-slate-500">{originDetail}</span>}
          {trip.duration_min ? <span className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400"><Clock className="size-3" aria-hidden />{formatDuration(trip.duration_min, locale)}</span> : null}
        </span>
        <span className="pt-0.5 text-[15px] font-semibold tabular-nums text-slate-500">{arrival ? formatTime(arrival, locale) : ""}</span>
        <span className="flex justify-center pt-1.5" aria-hidden>
          <span className="size-3 shrink-0 rounded-full border-[3px] border-accent-500 bg-white" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base font-bold text-slate-900">{destination}</span>
          {destinationDetail && <span className="block truncate text-sm text-slate-500">{destinationDetail}</span>}
        </span>
      </Link>

      <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3.5">
        <Avatar path={trip.driver_avatar_path} name={trip.driver_name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{trip.driver_name || d.common.unknownUser}</p>
          {trip.vehicle && <p className="flex min-w-0 items-center gap-1 text-xs text-slate-400"><Car className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{trip.vehicle}</span></p>}
          <p className="flex min-w-0 items-center gap-1 whitespace-nowrap text-xs text-slate-500">
            {trip.driver_rating_count > 0 ? (<><Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />{Number(trip.driver_rating).toFixed(1)} · {plural(d.units.reviews, trip.driver_rating_count, locale)}</>) : d.trip.newMember}
          </p>
        </div>
        {trip.status !== "completed" && (full
          ? <Badge tone="danger">{d.search.full}</Badge>
          : <Badge tone={trip.seats_available === 1 ? "warning" : "brand"}><Users className="size-3.5" aria-hidden />{plural(d.units.seatsLeft, trip.seats_available, locale)}</Badge>)}
      </div>

      <div className="relative z-10 mt-3.5 flex flex-wrap gap-2">
        <Link href={bookable ? `${href}#book` : href} className={buttonClass(bookable ? "primary" : "outline", "md", "min-w-32 flex-1")}>
          {bookable ? d.trip.bookNow : d.trip.viewDetails}
        </Link>
        {trip.driver_phone && open && (
          <a href={`tel:${trip.driver_phone}`} className={buttonClass("secondary", "md")} aria-label={`${d.trip.callDriver} ${formatTunisianPhone(trip.driver_phone)}`}>
            <Phone className="size-4" aria-hidden /><bdi dir="ltr">{formatTunisianPhone(trip.driver_phone)}</bdi>
          </a>
        )}
      </div>
    </article>
  );
}
