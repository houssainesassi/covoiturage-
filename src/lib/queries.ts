import "server-only";
import type { TripCardData } from "@/components/trips/trip-card";
import type { ServerSupabase } from "@/lib/supabase/server";

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
  vehicle: { brand: string; model: string; color: string } | null;
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
    vehicle: r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model}` : null,
    isDemo: r.is_demo ?? false,
    status: r.status,
  };
}

/** Adds the drivers' public phone numbers (shown on every ride post). */
export async function withDriverPhones<T extends { driver_id?: string }>(supabase: ServerSupabase, cards: T[]): Promise<(T & { driver_phone: string | null })[]> {
  const ids = [...new Set(cards.map((c) => c.driver_id).filter((id): id is string => !!id))];
  if (!ids.length) return cards.map((c) => ({ ...c, driver_phone: null }));
  const { data } = await supabase.rpc("get_driver_phones", { p_driver_ids: ids });
  const byId = new Map((data ?? []).map((r) => [r.driver_id, r.phone]));
  return cards.map((c) => ({ ...c, driver_phone: (c.driver_id && byId.get(c.driver_id)) || null }));
}
