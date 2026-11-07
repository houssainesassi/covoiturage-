import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/card";
import { VehicleForm } from "@/components/vehicles/vehicle-form";

export default async function NewVehiclePage() {
  const user = await requireUser("/dashboard/vehicles/new");
  const { d } = await getI18n();
  return (
    <div className="max-w-3xl">
      <PageHeader title={d.vehicles.newTitle} />
      <VehicleForm userId={user.id} />
    </div>
  );
}
