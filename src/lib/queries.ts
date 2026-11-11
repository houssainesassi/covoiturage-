import { vehicleName } from "@/lib/names";
import "server-only";
import type { TripCardData } from "@/components/trips/trip-card";

/** Columns for trip cards (plate_number deliberately excluded). */
export const TRIP_CARD_SELECT =
  "id, departure_at, price_per_seat, seats_available, seats_total, origin_id, destination_id, origin_address, destination_address, duration_min, status, is_demo, driver:profiles!trips_driver_id_fkey(id, full_name, avatar_path, rating_avg, rating_count), vehicle:vehicles!trips_vehicle_id_fkey(brand, model, color)" as const;

type Row = {
  id: string;
  departure_at: string;
  price_per_seat: number;
  seats_available: number;
  origin_id: string;
  destination_id: string;
  origin_address: string;
  destination_address: string;
  duration_min: number | null;
  is_demo?: boolean;
  status?: "scheduled" | "cancelled" | "completed";
  driver: { id: string; full_name: string; avatar_path: string | null; rating_avg: number; rating_count: number } | null;
  vehicle: { brand: string | null; model: string; color: string | null } | null;
};

export function toCard(r: Row): TripCardData {
  return {
    id: r.id,
    departure_at: r.departure_at,
    price_per_seat: Number(r.price_per_seat),
    seats_available: r.seats_available,
    origin_id: r.origin_id,
    destination_id: r.destination_id,
    origin_address: r.origin_address,
    destination_address: r.destination_address,
    duration_min: r.duration_min,
    driver_id: r.driver?.id,
    driver_name: r.driver?.full_name ?? "",
    driver_avatar_path: r.driver?.avatar_path ?? null,
    driver_rating: Number(r.driver?.rating_avg ?? 0),
    driver_rating_count: r.driver?.rating_count ?? 0,
    vehicle: r.vehicle ? vehicleName(r.vehicle) : null,
    isDemo: r.is_demo ?? false,
    status: r.status,
  };
}


/** Row returned by the search_trips RPC → trip card. */
export function searchRowToCard(r: import("@/lib/supabase/database.types").SearchResult): TripCardData {
  return { ...r, price_per_seat: Number(r.price_per_seat), driver_rating: Number(r.driver_rating), vehicle: [r.vehicle_brand, r.vehicle_model].filter(Boolean).join(" ") || null };
}

/**
 * Numbers of drivers who opted in, for signed-in viewers only (migration 17).
 * Fails safe: if the function is missing or errors, cards simply show no number.
 */
export async function withDriverPhones<T extends { driver_id?: string }>(supabase: import("@/lib/supabase/server").ServerSupabase, cards: T[]): Promise<(T & { driver_phone: string | null })[]> {
  const ids = [...new Set(cards.map((c) => c.driver_id).filter((x): x is string => !!x))];
  const phones = new Map<string, string>();
  // Guests: skip the call (the database refuses it anyway; this only saves a round trip).
  if (ids.length && (await supabase.auth.getSession()).data.session) {
    const { data } = await supabase.rpc("get_public_driver_phones", { p_driver_ids: ids });
    for (const r of data ?? []) phones.set(r.driver_id, r.phone);
  }
  return cards.map((c) => ({ ...c, driver_phone: (c.driver_id && phones.get(c.driver_id)) || null }));
}
