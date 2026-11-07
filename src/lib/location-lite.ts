import type { Location } from "./supabase/database.types";

/** Minimal location payload sent to client components. */
export type LocationLite = Pick<Location, "id" | "slug" | "name_fr" | "name_ar" | "name_en" | "governorate_code" | "kind" | "lat" | "lng">;

export const toLite = (l: Location): LocationLite => ({
  id: l.id, slug: l.slug, name_fr: l.name_fr, name_ar: l.name_ar, name_en: l.name_en,
  governorate_code: l.governorate_code, kind: l.kind, lat: l.lat, lng: l.lng,
});

export function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ًͯ-ٟ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").toLowerCase().trim();
}
