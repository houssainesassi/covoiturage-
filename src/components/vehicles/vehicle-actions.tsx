"use client";
import { deleteVehicleAction, setVehicleActiveAction } from "@/actions/vehicles";
import { useI18n } from "@/lib/i18n/client";
import { ConfirmAction } from "@/components/ui/client";

export function VehicleActions({ id, active }: { id: string; active: boolean }) {
  const { d } = useI18n();
  return (
    <div className="flex gap-2">
      <ConfirmAction action={setVehicleActiveAction.bind(null, id, !active)} label={active ? d.vehicles.archive : d.vehicles.restore} skipConfirm variant="ghost" successMessage={d.vehicles.saved} />
      <ConfirmAction
        action={deleteVehicleAction.bind(null, id)}
        label={d.common.delete}
        title={d.vehicles.deleteTitle}
        body={d.vehicles.deleteBody}
        confirmLabel={d.common.delete}
        successMessage={(r) => (r.ok && r.data === "archived" ? d.vehicles.archivedInstead : d.vehicles.deleted)}
        variant="ghost"
      />
    </div>
  );
}
