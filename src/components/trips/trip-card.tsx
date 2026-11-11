import Link from "next/link";
import { CalendarDays, Car, Phone, Star, Users } from "lucide-react";
import { formatTunisianPhone } from "@/lib/phone";
import { Avatar } from "@/components/ui/avatar";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";
import { formatDate, formatPrice, formatTime, plural } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
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
  const origin = locName(locations.get(trip.origin_id), locale);
  const destination = locName(locations.get(trip.destination_id), locale);
  const full = trip.seats_available <= 0;
  const open = (!trip.status || trip.status === "scheduled") && !trip.isDemo;
  const bookable = open && !full;
  const href = `/trips/${trip.id}`;
  return (
    // The route link stretches over the card; the buttons sit above it so they stay separate tap targets.
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-slate-200/80 bg-white shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[var(--shadow-lift)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 sm:px-5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <CalendarDays className="size-4 shrink-0 text-brand-600" aria-hidden />
          {formatDate(trip.departure_at, locale)}
        </p>
        <div className="flex items-center gap-1.5">
          {trip.isDemo && <DemoBadge label={d.common.demo} />}
          {trip.status === "completed" ? <Badge>{d.status.trip.completed}</Badge>
            : full ? <Badge tone="danger">{d.search.full}</Badge>
            : <Badge tone="brand"><Users className="size-3.5" aria-hidden />{plural(d.units.seatsLeft, trip.seats_available, locale)}</Badge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex gap-3">
          <div className="flex flex-col items-center py-1.5" aria-hidden>
            <span className="size-3 shrink-0 rounded-full border-[3px] border-brand-600" />
            <span className="my-1 w-0.5 flex-1 bg-slate-200" />
            <span className="size-3 shrink-0 rounded-full border-[3px] border-accent-500" />
          </div>
          <Link href={href} aria-label={routeLabel(origin, destination, locale)} className="min-w-0 flex-1 space-y-3 after:absolute after:inset-0 after:content-['']">
            <div>
              <p className="flex items-baseline gap-2">
                <span className="text-lg font-extrabold tabular-nums text-slate-900">{formatTime(trip.departure_at, locale)}</span>
                <span className="truncate font-bold text-slate-900">{origin}</span>
              </p>
              <p className="truncate text-sm text-slate-500">{d.search.from}: {trip.origin_address}</p>
            </div>
            <div>
              <p className="truncate font-bold text-slate-900">{destination}</p>
              <p className="truncate text-sm text-slate-500">{d.search.to}: {trip.destination_address}</p>
            </div>
          </Link>
          <div className="shrink-0 text-end">
            <p className="text-xl font-extrabold text-brand-700">{formatPrice(trip.price_per_seat, locale)}</p>
            <p className="text-xs text-slate-500">{d.common.perSeat}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Avatar path={trip.driver_avatar_path} name={trip.driver_name} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{trip.driver_name || d.common.unknownUser}</p>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              {trip.driver_rating_count > 0 ? (<><Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />{Number(trip.driver_rating).toFixed(1)} · {plural(d.units.reviews, trip.driver_rating_count, locale)}</>) : d.trip.newMember}
            </p>
          </div>
          {trip.vehicle && <p className="hidden min-w-0 items-center gap-1.5 truncate text-xs text-slate-500 sm:flex"><Car className="size-4 shrink-0" aria-hidden /><span className="truncate">{trip.vehicle}</span></p>}
        </div>

        <div className="relative z-10 mt-4 flex flex-wrap gap-2">
          <Link href={bookable ? `${href}#book` : href} className={buttonClass(bookable ? "primary" : "outline", "md", "min-w-32 flex-1 text-base")}>
            {bookable ? d.trip.bookNow : d.trip.viewDetails}
          </Link>
          {trip.driver_phone && open && (
            <a href={`tel:${trip.driver_phone}`} className={buttonClass("secondary", "md", "text-base")} aria-label={`${d.trip.callDriver} ${formatTunisianPhone(trip.driver_phone)}`}>
              <Phone className="size-4" aria-hidden /><bdi dir="ltr">{formatTunisianPhone(trip.driver_phone)}</bdi>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
