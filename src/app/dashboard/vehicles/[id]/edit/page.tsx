import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/card";
import { VehicleForm } from "@/components/vehicles/vehicle-form";

export default async function EditVehiclePage({ params }: PageProps<"/dashboard/vehicles/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/vehicles/${id}/edit`);
  const { d } = await getI18n();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_vehicles");
  const vehicle = (data ?? []).find((v) => v.id === id);
  if (!vehicle) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={d.vehicles.editTitle} />
      <VehicleForm userId={user.id} vehicle={vehicle} />
    </div>
  );
}
