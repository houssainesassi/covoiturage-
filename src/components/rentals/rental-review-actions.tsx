"use client";
import { CheckCircle2, EyeOff, XCircle } from "lucide-react";
import { adminSetRentalStatusAction } from "@/actions/rentals";
import { useI18n } from "@/lib/i18n/client";
import { ConfirmAction } from "@/components/ui/client";
import type { RentalStatus } from "@/lib/supabase/database.types";

const icon = "size-3.5";

export function RentalReviewActions({ id, status }: { id: string; status: RentalStatus }) {
  const { d } = useI18n();
  const common = { cancelLabel: d.admin.keep, successMessage: d.admin.done, size: "xs" as const };
  return (
    <>
      {status !== "approved" && (
        <ConfirmAction {...common} action={adminSetRentalStatusAction.bind(null, id, "approved")} label={d.rentals.approve} icon={<CheckCircle2 className={icon} aria-hidden />} title={d.rentals.approveTitle} body={d.rentals.approveBody} confirmLabel={d.rentals.approve} confirmVariant="primary" variant="secondary" />
      )}
      {status === "pending" && (
        <ConfirmAction {...common} action={(note) => adminSetRentalStatusAction(id, "rejected", note)} withReason label={d.rentals.reject} icon={<XCircle className={icon} aria-hidden />} title={d.rentals.reject} confirmLabel={d.rentals.reject} variant="dangerOutline" />
      )}
      {status === "approved" && (
        <ConfirmAction {...common} action={(note) => adminSetRentalStatusAction(id, "hidden", note)} withReason label={d.rentals.hide} icon={<EyeOff className={icon} aria-hidden />} title={d.rentals.hide} confirmLabel={d.rentals.hide} variant="dangerOutline" />
      )}
    </>
  );
}
