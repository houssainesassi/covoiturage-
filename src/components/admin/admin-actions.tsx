"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { adminCancelBookingAction, adminCancelTripAction, adminSetMessageHiddenAction, adminSetReviewHiddenAction, adminSetUserRoleAction, adminSetUserStatusAction, adminUpdateReportAction } from "@/actions/admin";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/format";
import { ConfirmAction } from "@/components/ui/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import type { Enums } from "@/lib/supabase/database.types";

export function UserActions({ id, name, status, role, self }: { id: string; name: string; status: Enums<"account_status">; role: Enums<"user_role">; self: boolean }) {
  const { d } = useI18n();
  if (self) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {status === "active" ? (
        <ConfirmAction action={adminSetUserStatusAction.bind(null, id, "suspended")} label={d.admin.suspend} title={fmt(d.admin.suspendTitle, { name })} body={d.admin.suspendBody} confirmLabel={d.admin.suspend} withReason successMessage={d.admin.done} variant="outline" />
      ) : (
        <ConfirmAction action={adminSetUserStatusAction.bind(null, id, "active")} label={d.admin.activate} skipConfirm successMessage={d.admin.done} variant="secondary" />
      )}
      <ConfirmAction action={adminSetUserRoleAction.bind(null, id, role === "admin" ? "user" : "admin")} label={role === "admin" ? d.admin.removeAdmin : d.admin.makeAdmin} body={role === "admin" ? d.admin.removeAdmin : d.admin.makeAdmin} confirmVariant="primary" successMessage={d.admin.done} variant="ghost" />
    </div>
  );
}

export function CancelTripButton({ id }: { id: string }) {
  const { d } = useI18n();
  return <ConfirmAction action={adminCancelTripAction.bind(null, id)} label={d.admin.cancelTrip} title={d.driverTrips.cancelTripTitle} body={d.driverTrips.cancelTripBody} confirmLabel={d.admin.cancelTrip} withReason successMessage={d.admin.done} />;
}

export function CancelBookingButton({ id }: { id: string }) {
  const { d } = useI18n();
  return <ConfirmAction action={adminCancelBookingAction.bind(null, id)} label={d.admin.cancelBooking} title={d.bookings.cancelTitle} confirmLabel={d.admin.cancelBooking} withReason successMessage={d.admin.done} />;
}

export function HideButton({ kind, id, hidden }: { kind: "review" | "message"; id: string; hidden: boolean }) {
  const { d } = useI18n();
  const action = kind === "review" ? adminSetReviewHiddenAction.bind(null, id, !hidden) : adminSetMessageHiddenAction.bind(null, id, !hidden);
  return <ConfirmAction action={action} label={hidden ? d.admin.unhide : kind === "review" ? d.admin.hideReview : d.admin.hideMessage} skipConfirm successMessage={d.admin.done} variant={hidden ? "secondary" : "outline"} />;
}

export function ReportControls({ id, status, note }: { id: string; status: Enums<"report_status">; note: string | null }) {
  const { d } = useI18n();
  const router = useRouter();
  const [text, setText] = useState(note ?? "");
  const [pending, start] = useTransition();
  const set = (s: Enums<"report_status">) =>
    start(async () => {
      const r = await adminUpdateReportAction(id, s, text);
      if (r.ok) { toast.success(d.admin.done); router.refresh(); } else toast.error(d.errors[r.error]);
    });
  return (
    <div className="space-y-2">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={d.admin.note} aria-label={d.admin.note} maxLength={500} className="min-h-16 text-sm" />
      <div className="flex flex-wrap gap-1.5">
        {status === "open" && <Button size="sm" variant="outline" loading={pending} onClick={() => set("in_review")}>{d.admin.markInReview}</Button>}
        <Button size="sm" loading={pending} onClick={() => set("resolved")}>{d.admin.resolve}</Button>
        <Button size="sm" variant="ghost" loading={pending} onClick={() => set("dismissed")}>{d.admin.dismiss}</Button>
      </div>
    </div>
  );
}
