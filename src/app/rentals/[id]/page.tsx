import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarClock, Car, FileText, MapPin, Phone, Users } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { rentalsEnabled } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation";
import { locName } from "@/lib/names";
import { publicUrl } from "@/lib/storage";
import { formatTunisianPhone } from "@/lib/phone";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

async function getListing(id: string) {
  if (!uuidSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  // RLS returns approved listings to everyone, and pending ones only to their owner or an admin.
  const { data } = await supabase.from("rental_listings").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/rentals/[id]">): Promise<Metadata> {
  const { id } = await params;
  const r = rentalsEnabled() ? await getListing(id) : null;
  return { title: r ? [r.brand, r.model].filter(Boolean).join(" ") : undefined };
}

export default async function RentalPage({ params }: PageProps<"/rentals/[id]">) {
  if (!rentalsEnabled()) notFound();
  const { id } = await params;
  const [{ d, locale }, r, byId] = await Promise.all([getI18n(), getListing(id), getLocationMap()]);
  if (!r) notFound();
  const photos = r.photo_paths.map((p) => publicUrl("rentals", p)).filter((u): u is string => !!u);
  const rows = [
    { Icon: Car, label: d.vehicles.type, value: d.vehicles.types[r.vehicle_type] },
    { Icon: Users, label: d.vehicles.seats, value: String(r.seats) },
    { Icon: MapPin, label: d.rentals.area, value: locName(byId.get(r.location_id), locale) },
    { Icon: BadgeCheck, label: d.rentals.licence, value: r.licence_number },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28 pt-4 sm:px-6 sm:pt-8">
      {r.status !== "approved" && <p className="mb-3"><Badge tone="warning">{d.rentals.status[r.status]}</Badge></p>}
      {/* Photos: swipe on phones */}
      <div className="wf-scroll-x -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {photos.map((src, i) => (
          <div key={src} className="relative aspect-[4/3] w-[85%] shrink-0 snap-center overflow-hidden rounded-3xl bg-slate-100 sm:w-[48%]">
            <Image src={src} alt={`${[r.brand, r.model].filter(Boolean).join(" ")} ${i + 1}`} fill sizes="(min-width: 640px) 50vw, 85vw" priority={i === 0} className="object-cover" />
          </div>
        ))}
      </div>

      <h1 className="mt-5 text-2xl font-extrabold sm:text-3xl">{r.brand} {r.model}{r.year ? ` · ${r.year}` : ""}</h1>
      <p className="text-slate-500">{r.agency_name}</p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rows.map(({ Icon, label, value }) => (
          <div key={label} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
            <dt className="flex items-center gap-1.5 text-xs text-slate-500"><Icon className="size-4 text-accent-600" aria-hidden />{label}</dt>
            <dd className="mt-1 truncate font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {r.availability && (
        <section className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="size-5 text-accent-600" aria-hidden />{d.rentals.availability}</h2>
          <p className="mt-1 whitespace-pre-line text-slate-700" dir="auto">{r.availability}</p>
        </section>
      )}
      {r.conditions && (
        <section className="mt-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <h2 className="flex items-center gap-2 font-semibold"><FileText className="size-5 text-accent-600" aria-hidden />{d.rentals.conditions}</h2>
          <p className="mt-1 whitespace-pre-line text-slate-700" dir="auto">{r.conditions}</p>
        </section>
      )}
      <p className="mt-4 rounded-2xl bg-accent-50 p-4 text-sm text-accent-700">{d.rentals.priceNote}</p>
      <p className="mt-3 text-xs text-slate-500">{d.rentals.legalNote}</p>

      {/* Call bar, always in reach */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md">
        <a href={`tel:${r.phone}`} className={buttonClass("accent", "lg", "mx-auto flex w-full max-w-4xl")}>
          <Phone className="size-5" aria-hidden />{d.rentals.call} · <span dir="ltr">{formatTunisianPhone(r.phone)}</span>
        </a>
      </div>
    </div>
  );
}
