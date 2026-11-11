import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { getLocationMap } from "@/lib/locations";
import { rentalsEnabled } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/i18n/format";
import { formatTunisianPhone } from "@/lib/phone";
import { locName } from "@/lib/names";
import { oneOf } from "@/lib/admin";
import { PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { DataTable, RowActions, Td } from "@/components/admin/table";
import { RentalReviewActions } from "@/components/rentals/rental-review-actions";

/** Licence review queue. A listing is public only after an admin approves it. */
export default async function AdminRentalsPage({ searchParams }: PageProps<"/admin/rentals">) {
  if (!rentalsEnabled()) notFound();
  const sp = await searchParams;
  const status = oneOf(sp.status, ["pending", "approved", "rejected", "hidden"] as const) ?? "pending";
  const { d, locale } = await getI18n();
  const supabase = await createClient();
  const [{ data }, byId] = await Promise.all([
    supabase.from("rental_listings").select("id, agency_name, licence_number, brand, model, phone, location_id, status, created_at").eq("status", status).order("created_at").limit(100),
    getLocationMap(),
  ]);
  const rows = data ?? [];
  return (
    <div>
      <PageHeader title={d.rentals.title} description={d.rentals.adminSubtitle} />
      <nav className="mb-4 flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "hidden"] as const).map((s) => (
          <Link key={s} href={`/admin/rentals?status=${s}`} aria-current={s === status ? "page" : undefined} className={s === status ? "rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white" : "rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-slate-200"}>{d.rentals.status[s]}</Link>
        ))}
      </nav>
      {!rows.length ? <EmptyState icon={<KeyRound className="size-6" />} title={d.rentals.empty} /> : (
        <DataTable head={[d.rentals.agency, d.rentals.licence, d.rentals.area, d.rentals.phone, d.common.date, d.common.actions]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td primary><Link href={`/rentals/${r.id}`} className="font-semibold hover:text-brand-700">{r.agency_name}</Link><p className="text-xs text-slate-500">{r.brand} {r.model}</p></Td>
              <Td label={d.rentals.licence}><span dir="ltr">{r.licence_number}</span></Td>
              <Td label={d.rentals.area}>{locName(byId.get(r.location_id), locale)}</Td>
              <Td label={d.rentals.phone}><span dir="ltr">{formatTunisianPhone(r.phone)}</span></Td>
              <Td label={d.common.date}>{formatDateTime(r.created_at, locale)}</Td>
              <Td actions><RowActions><Badge>{d.rentals.status[r.status]}</Badge><RentalReviewActions id={r.id} status={r.status} /></RowActions></Td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
