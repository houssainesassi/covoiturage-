"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { fetchRoute, type LatLng } from "@/lib/routing";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function pin(color: string, label: string) {
  return L.divIcon({
    className: "wasalni-pin",
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.7 0 0 6.6 0 14.8 0 26 15 40 15 40s15-14 15-25.2C30 6.6 23.3 0 15 0z" fill="${color}"/><circle cx="15" cy="15" r="9" fill="#fff"/><text x="15" y="19.5" text-anchor="middle" font-size="12" font-weight="700" font-family="sans-serif" fill="${color}">${label}</text></svg>`,
  });
}
export const originIcon = pin("#1a7e68", "A");
export const destinationIcon = pin("#f76a25", "B");

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) map.fitBounds(L.latLngBounds(points), { padding: [32, 32] });
    else if (points.length === 1) map.setView(points[0], 13);
  }, [map, points]);
  return null;
}

export function RouteMap({ origin, destination, className }: { origin: LatLng; destination: LatLng; className?: string }) {
  const [path, setPath] = useState<[number, number][] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchRoute(origin, destination, ctrl.signal).then((r) => setPath(r.path)).catch(() => setPath(null));
    return () => ctrl.abort();
  }, [origin, destination]);
  const straight: [number, number][] = [[origin.lat, origin.lng], [destination.lat, destination.lng]];
  const fit = useMemo(() => path ?? straight, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <MapContainer center={[origin.lat, origin.lng]} zoom={9} scrollWheelZoom={false} className={className}>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <Marker position={[origin.lat, origin.lng]} icon={originIcon} />
      <Marker position={[destination.lat, destination.lng]} icon={destinationIcon} />
      <Polyline positions={path ?? straight} pathOptions={{ color: "#1a7e68", weight: 5, opacity: 0.85, dashArray: path ? undefined : "8 10" }} />
      <FitBounds points={fit} />
    </MapContainer>
  );
}

function ClickHandler({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Recenter({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], 14);
  }, [map, center]);
  return null;
}

/** Click or drag to choose an exact point. */
export function LocationPicker({ value, center, onChange, variant, className }: { value: LatLng; center: LatLng; onChange: (p: LatLng) => void; variant: "origin" | "destination"; className?: string }) {
  return (
    <MapContainer center={[value.lat, value.lng]} zoom={14} scrollWheelZoom={false} className={className}>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <Recenter center={center} />
      <ClickHandler onPick={onChange} />
      <Marker
        position={[value.lat, value.lng]}
        icon={variant === "origin" ? originIcon : destinationIcon}
        draggable
        eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); onChange({ lat: ll.lat, lng: ll.lng }); } }}
      />
    </MapContainer>
  );
}
