import Link from "next/link";
import { Car, Star } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";
import { formatDate, formatDuration, formatPrice, formatTime, plural } from "@/lib/i18n/format";
import { locName } from "@/lib/names";
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
  driver_name: string;
  driver_avatar_path: string | null;
  driver_rating: number;
  driver_rating_count: number;
  vehicle: string | null;
};

export function TripCard({ trip, locations, d, locale, showDate = true }: { trip: TripCardData; locations: Map<string, Location>; d: Dictionary; locale: Locale; showDate?: boolean }) {
  const o = locations.get(trip.origin_id);
  const dest = locations.get(trip.destination_id);
  const arrival = trip.duration_min ? new Date(new Date(trip.departure_at).getTime() + trip.duration_min * 60000) : null;
  const full = trip.seats_available <= 0;
  return (
    <Link href={`/trips/${trip.id}`} className="group block rounded-[var(--radius-card)] border border-slate-200/80 bg-white p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:p-5">
      {showDate && <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-700">{formatDate(trip.departure_at, locale)}</p>}
      <div className="flex gap-4">
        <div className="flex flex-col items-center pt-1" aria-hidden>
          <span className="size-3 rounded-full border-[3px] border-brand-600" />
          <span className="my-1 w-0.5 flex-1 bg-slate-200" />
          <span className="size-3 rounded-full border-[3px] border-accent-500" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="flex items-baseline gap-2"><span className="text-lg font-bold tabular-nums">{formatTime(trip.departure_at, locale)}</span><span className="truncate font-semibold text-slate-900">{locName(o, locale)}</span></p>
            <p className="truncate text-sm text-slate-500">{trip.origin_address}</p>
          </div>
          {trip.duration_min ? <p className="text-xs text-slate-400">{formatDuration(trip.duration_min, locale)}</p> : null}
          <div>
            <p className="flex items-baseline gap-2"><span className="text-lg font-bold tabular-nums">{arrival ? formatTime(arrival, locale) : "··:··"}</span><span className="truncate font-semibold text-slate-900">{locName(dest, locale)}</span></p>
            <p className="truncate text-sm text-slate-500">{trip.destination_address}</p>
          </div>
        </div>
        <div className="text-end">
          <p className="text-xl font-extrabold text-slate-900">{formatPrice(trip.price_per_seat, locale)}</p>
          <p className="text-xs text-slate-500">{d.common.perSeat}</p>
          <div className="mt-2">{full ? <Badge tone="danger">{d.search.full}</Badge> : <Badge tone="brand">{plural(d.units.seatsLeft, trip.seats_available, locale)}</Badge>}</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
        <Avatar path={trip.driver_avatar_path} name={trip.driver_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{trip.driver_name || d.common.unknownUser}</p>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            {trip.driver_rating_count > 0 ? (<><Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />{Number(trip.driver_rating).toFixed(1)} · {plural(d.units.reviews, trip.driver_rating_count, locale)}</>) : d.trip.newMember}
          </p>
        </div>
        {trip.vehicle && <p className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex"><Car className="size-4" aria-hidden />{trip.vehicle}</p>}
      </div>
    </Link>
  );
}
