"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/misc";

// Leaflet touches `window`, so maps are client-only.
export const RouteMap = dynamic(() => import("./leaflet-maps").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});
export const LocationPicker = dynamic(() => import("./leaflet-maps").then((m) => m.LocationPicker), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});
