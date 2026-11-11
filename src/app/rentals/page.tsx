import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CirclePlus, KeyRound } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { rentalsEnabled } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { locName } from "@/lib/names";
import { CarArt } from "@/components/destinations/art";
import { RentalCard } from "@/components/rentals/rental-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.rentals.title };
}

export default async function RentalsPage({ searchParams }: PageProps<"/rentals">) {
  if (!rentalsEnabled()) notFound();
  const sp = await searchParams;
  const { d, locale } = await getI18n();
  const locations = await getLocations();
  const byId = new Map(locations.map((l) => [l.id, l]));
  const city = locations.find((l) => l.slug === sp.city);

  const supabase = await createClient();
  let q = supabase.from("rental_listings").select("id, brand, model, year, seats, vehicle_type, photo_paths, location_id, agency_name").eq("status", "approved");
  if (city) q = q.eq("location_id", city.id);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(48);
  const rows = data ?? [];
  // City chips: only towns that actually have listings (from the unfiltered query when filtered).
  const { data: all } = await supabase.from("rental_listings").select("location_id").eq("status", "approved").limit(500);
  const cities = [...new Set((all ?? []).map((r) => r.location_id))].map((id) => byId.get(id)).filter((l) => !!l);

  const chip = (on: boolean) => cn("inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold", on ? "bg-accent-600 text-white" : "bg-white ring-1 ring-slate-200");
  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-4 sm:px-6 sm:pt-8">
      <header className="flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-r from-accent-50 to-white p-4 ring-1 ring-accent-100 sm:p-6">
        <CarArt tone="accent" className="w-28 shrink-0 sm:w-48" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold sm:text-3xl"><KeyRound className="size-6 text-accent-600" aria-hidden />{d.rentals.title}</h1>
          <p className="mt-1 text-slate-600">{d.rentals.subtitle}</p>
        </div>
      </header>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="wf-scroll-x flex min-w-0 gap-2 overflow-x-auto pb-1">
          <Link href="/rentals" className={chip(!city)}>{d.common.all}</Link>
          {cities.map((l) => <Link key={l.id} href={`/rentals?city=${l.slug}`} className={chip(city?.id === l.id)}>{locName(l, locale)}</Link>)}
        </div>
        <ButtonLink href="/dashboard/rentals/new" variant="accent" size="sm" className="shrink-0"><CirclePlus className="size-4" aria-hidden />{d.rentals.add}</ButtonLink>
      </div>
      {error ? (
        <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{d.errors.unknown}</p>
      ) : rows.length ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => <RentalCard key={r.id} r={r} location={byId.get(r.location_id)} d={d} locale={locale} />)}
        </div>
      ) : (
        <div className="mt-5"><EmptyState icon={<KeyRound className="size-6" />} title={d.rentals.empty} /></div>
      )}
      <p className="mt-6 text-xs text-slate-500">{d.rentals.legalNote}</p>
    </div>
  );
}
