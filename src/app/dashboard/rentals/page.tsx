import Link from "next/link";
import { notFound } from "next/navigation";
import { CirclePlus, KeyRound, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { rentalsEnabled } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { deleteRentalAction } from "@/actions/rentals";
import { locName } from "@/lib/names";
import { PageHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/client";
import { EmptyState } from "@/components/ui/misc";
import type { RentalStatus } from "@/lib/supabase/database.types";

const TONE: Record<RentalStatus, Tone> = { pending: "warning", approved: "success", rejected: "danger", hidden: "neutral" };

export default async function MyRentalsPage() {
  if (!rentalsEnabled()) notFound();
  const user = await requireUser("/dashboard/rentals");
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [{ data, error }, byId] = await Promise.all([
    supabase.from("rental_listings").select("id, brand, model, year, status, review_note, location_id").eq("owner_id", user.id).order("created_at", { ascending: false }),
    getLocationMap(),
  ]);
  const rows = data ?? [];
  return (
    <div className="max-w-3xl">
      <PageHeader title={d.rentals.mine} action={<ButtonLink href="/dashboard/rentals/new" variant="accent" size="sm"><CirclePlus className="size-4" aria-hidden />{d.rentals.add}</ButtonLink>} />
      {error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{d.errors.unknown}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<KeyRound className="size-6" />} title={d.rentals.mineEmpty} action={<ButtonLink href="/dashboard/rentals/new">{d.rentals.add}</ButtonLink>} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <Link href={`/rentals/${r.id}`} className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.brand} {r.model}{r.year ? ` · ${r.year}` : ""}</p>
                <p className="text-sm text-slate-500">{locName(byId.get(r.location_id), locale)}</p>
                {r.review_note && <p className="mt-1 text-sm text-slate-600" dir="auto">{r.review_note}</p>}
              </Link>
              <Badge tone={TONE[r.status]}>{d.rentals.status[r.status]}</Badge>
              <ConfirmAction action={deleteRentalAction.bind(null, r.id)} label={d.common.delete} icon={<Trash2 className="size-4" aria-hidden />} title={d.rentals.deleteTitle} confirmLabel={d.common.delete} cancelLabel={d.common.cancel} variant="dangerOutline" size="xs" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
