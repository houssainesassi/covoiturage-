import { vehicleName } from "@/lib/names";
import Image from "next/image";
import Link from "next/link";
import { CarFront, Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { plural } from "@/lib/i18n/format";
import { publicUrl } from "@/lib/storage";
import { PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { VehicleActions } from "@/components/vehicles/vehicle-actions";

export default async function VehiclesPage() {
  await requireUser("/dashboard/vehicles");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const { data: vehicles } = await supabase.rpc("get_my_vehicles");
  return (
    <div>
      <PageHeader title={d.vehicles.title} description={d.vehicles.subtitle} action={<ButtonLink href="/dashboard/vehicles/new">{d.vehicles.add}</ButtonLink>} />
      {!(vehicles ?? []).length ? (
        <EmptyState icon={<CarFront className="size-6" />} title={d.vehicles.empty} action={<ButtonLink href="/dashboard/vehicles/new">{d.vehicles.add}</ButtonLink>} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {vehicles!.map((v) => (
            <li key={v.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)]">
              <div className="relative h-40 bg-slate-100">
                {v.photo_paths[0] ? <Image src={publicUrl("vehicles", v.photo_paths[0])!} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" /> : <CarFront className="absolute inset-0 m-auto size-12 text-slate-300" aria-hidden />}
                {!v.is_active && <Badge tone="neutral" className="absolute start-3 top-3">{d.vehicles.archived}</Badge>}
              </div>
              <div className="p-4">
                <p className="text-lg font-semibold">{vehicleName(v)}</p>
                <p className="text-sm text-slate-500">{[v.type && d.vehicles.types[v.type], v.color, v.year, plural(d.units.seats, v.seats, locale)].filter(Boolean).join(" · ")}</p>
                {v.plate_number && <p className="mt-1 text-sm font-medium text-slate-700">{v.plate_number}</p>}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/dashboard/vehicles/${v.id}/edit`} className={buttonClass("outline", "sm")}><Pencil className="size-4" aria-hidden />{d.common.edit}</Link>
                  <VehicleActions id={v.id} active={v.is_active} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
