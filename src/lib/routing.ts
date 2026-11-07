export type LatLng = { lat: number; lng: number };

/** Driving route from the public OSRM server (OpenStreetMap data). */
export async function fetchRoute(a: LatLng, b: LatLng, signal?: AbortSignal) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=simplified&geometries=geojson`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("route");
  const json = (await res.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
  const r = json.routes?.[0];
  if (!r) throw new Error("route");
  return {
    distanceKm: Math.round(r.distance / 100) / 10,
    durationMin: Math.round(r.duration / 60),
    path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
  };
}

/** Cost-sharing suggestion (~0.08 DT/km per seat, rounded to 0.5 DT). */
export function suggestPrice(km: number) {
  return Math.max(1, Math.round(km * 0.08 * 2) / 2);
}
