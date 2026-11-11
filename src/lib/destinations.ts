import type { Location } from "./supabase/database.types";

/** Most requested destinations, shown as cards on the home page (home city first). */
export const FEATURED_DESTINATIONS = ["el-fahs", "zaghouan", "tunis", "sousse", "siliana"] as const;

export type ArtKind = "el-fahs" | "zaghouan" | "tunis" | "sousse" | "siliana" | "generic";

export function artFor(slug: string): ArtKind {
  return (FEATURED_DESTINATIONS as readonly string[]).includes(slug) ? (slug as ArtKind) : "generic";
}

export type Direction = "go" | "back";

/**
 * The two directions of a destination page.
 * For another city: go = home → city, back = city → home.
 * For the home city itself: go = anywhere → home, back = home → anywhere.
 */
export function routeFor(home: Location, dest: Location, dir: Direction): { origin: Location | null; destination: Location | null } {
  if (home.id === dest.id) return dir === "go" ? { origin: null, destination: home } : { origin: home, destination: null };
  return dir === "go" ? { origin: home, destination: dest } : { origin: dest, destination: home };
}
