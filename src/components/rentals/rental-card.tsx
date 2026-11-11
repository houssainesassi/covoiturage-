import Image from "next/image";
import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { Locale } from "@/lib/i18n/config";
import { locName } from "@/lib/names";
import { publicUrl } from "@/lib/storage";
import type { Location, RentalListing } from "@/lib/supabase/database.types";

export type RentalCardData = Pick<RentalListing, "id" | "brand" | "model" | "year" | "seats" | "vehicle_type" | "photo_paths" | "location_id" | "agency_name">;

export function RentalCard({ r, location, d, locale }: { r: RentalCardData; location?: Location; d: Dictionary; locale: Locale }) {
  const photo = publicUrl("rentals", r.photo_paths[0]);
  return (
    <Link href={`/rentals/${r.id}`} className="group block overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <div className="relative aspect-[4/3] bg-slate-100">
        {photo && <Image src={photo} alt={[r.brand, r.model].filter(Boolean).join(" ")} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />}
      </div>
      <div className="p-4">
        <p className="truncate text-lg font-bold">{r.brand} {r.model}{r.year ? ` · ${r.year}` : ""}</p>
        <p className="truncate text-sm text-slate-500">{r.agency_name}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="flex items-center gap-1"><MapPin className="size-4 text-brand-600" aria-hidden />{locName(location, locale)}</span>
          <span className="flex items-center gap-1"><Users className="size-4 text-brand-600" aria-hidden />{r.seats}</span>
          <span>{d.vehicles.types[r.vehicle_type]}</span>
        </p>
      </div>
    </Link>
  );
}
