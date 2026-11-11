import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getLocations } from "@/lib/locations";
import { toLite } from "@/lib/location-lite";
import { rentalsEnabled } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/card";
import { RentalForm } from "@/components/rentals/rental-form";

export default async function NewRentalPage() {
  if (!rentalsEnabled()) notFound();
  const user = await requireUser("/dashboard/rentals/new");
  const { d } = await getI18n();
  const supabase = await createClient();
  const [locations, { data: priv }] = await Promise.all([
    getLocations(),
    supabase.from("profile_private").select("phone").eq("id", user.id).maybeSingle(),
  ]);
  return (
    <div className="max-w-3xl">
      <PageHeader title={d.rentals.add} description={d.rentals.addSubtitle} />
      <RentalForm userId={user.id} locations={locations.map(toLite)} defaultPhone={priv?.phone ?? undefined} />
    </div>
  );
}
