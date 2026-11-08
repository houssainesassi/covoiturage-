"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle2, Eye, EyeOff, Hourglass, RotateCcw, Save, ShieldCheck, ShieldOff, XCircle } from "lucide-react";
import { adminCancelBookingAction, adminCancelTripAction, adminSetMessageHiddenAction, adminSetReviewHiddenAction, adminSetUserRoleAction, adminSetUserStatusAction, adminUpdateReportAction } from "@/actions/admin";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/format";
import { ConfirmAction } from "@/components/ui/client";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/form";
import type { Enums } from "@/lib/supabase/database.types";

const icon = "size-3.5";

export function UserActions({ id, name, status, role, self }: { id: string; name: string; status: Enums<"account_status">; role: Enums<"user_role">; self: boolean }) {
  const { d } = useI18n();
  if (self) return null;
  const isAdmin = role === "admin";
  return (
    <>
      {status === "active" ? (
        <ConfirmAction action={adminSetUserStatusAction.bind(null, id, "suspended")} label={d.admin.suspend} icon={<Ban className={icon} aria-hidden />} title={fmt(d.admin.suspendTitle, { name })} body={d.admin.suspendBody} confirmLabel={d.admin.suspend} cancelLabel={d.admin.keep} withReason successMessage={d.admin.done} variant="dangerOutline" size="xs" />
      ) : (
        <ConfirmAction action={adminSetUserStatusAction.bind(null, id, "active")} label={d.admin.activate} icon={<RotateCcw className={icon} aria-hidden />} title={fmt(d.admin.activateTitle, { name })} body={d.admin.activateBody} confirmLabel={d.admin.activate} cancelLabel={d.admin.keep} confirmVariant="primary" successMessage={d.admin.done} variant="secondary" size="xs" />
      )}
      <ConfirmAction
        action={adminSetUserRoleAction.bind(null, id, isAdmin ? "user" : "admin")}
        label={isAdmin ? d.admin.removeAdmin : d.admin.makeAdmin}
        icon={isAdmin ? <ShieldOff className={icon} aria-hidden /> : <ShieldCheck className={icon} aria-hidden />}
        title={fmt(isAdmin ? d.admin.removeAdminTitle : d.admin.makeAdminTitle, { name })}
        body={isAdmin ? d.admin.removeAdminBody : d.admin.makeAdminBody}
        confirmLabel={isAdmin ? d.admin.removeAdmin : d.admin.makeAdmin}
        cancelLabel={d.admin.keep}
        confirmVariant={isAdmin ? "danger" : "primary"}
        successMessage={d.admin.done}
        variant="ghost"
        size="xs"
      />
    </>
  );
}

/** Names the record inside the dialog, so the admin can see which row they are acting on. */
function Subject({ subject, body }: { subject: string; body: ReactNode }) {
  return <><strong className="mb-1 block text-slate-900">{subject}</strong>{body}</>;
}

export function CancelTripButton({ id, subject }: { id: string; subject: string }) {
  const { d } = useI18n();
  return <ConfirmAction action={adminCancelTripAction.bind(null, id)} label={d.admin.cancelTrip} icon={<XCircle className={icon} aria-hidden />} title={d.driverTrips.cancelTripTitle} body={<Subject subject={subject} body={d.admin.cancelTripBody} />} confirmLabel={d.admin.cancelTrip} cancelLabel={d.admin.keep} withReason successMessage={d.admin.done} variant="dangerOutline" size="xs" />;
}

export function CancelBookingButton({ id, subject }: { id: string; subject: string }) {
  const { d } = useI18n();
  return <ConfirmAction action={adminCancelBookingAction.bind(null, id)} label={d.admin.cancelBooking} icon={<XCircle className={icon} aria-hidden />} title={d.bookings.cancelTitle} body={<Subject subject={subject} body={d.admin.cancelBookingBody} />} confirmLabel={d.admin.cancelBooking} cancelLabel={d.admin.keep} withReason successMessage={d.admin.done} variant="dangerOutline" size="xs" />;
}

export function HideButton({ kind, id, hidden }: { kind: "review" | "message"; id: string; hidden: boolean }) {
  const { d } = useI18n();
  const action = kind === "review" ? adminSetReviewHiddenAction.bind(null, id, !hidden) : adminSetMessageHiddenAction.bind(null, id, !hidden);
  if (hidden) return <ConfirmAction action={action} label={d.admin.unhide} icon={<Eye className={icon} aria-hidden />} skipConfirm successMessage={d.admin.done} variant="secondary" size="xs" />;
  const isReview = kind === "review";
  const label = isReview ? d.admin.hideReview : d.admin.hideMessage;
  return <ConfirmAction action={action} label={label} icon={<EyeOff className={icon} aria-hidden />} title={isReview ? d.admin.hideReviewTitle : d.admin.hideMessageTitle} body={isReview ? d.admin.hideReviewBody : d.admin.hideMessageBody} confirmLabel={label} cancelLabel={d.admin.keep} successMessage={d.admin.done} variant="dangerOutline" size="xs" />;
}

export function ReportControls({ id, status, note }: { id: string; status: Enums<"report_status">; note: string | null }) {
  const { d } = useI18n();
  const router = useRouter();
  const [text, setText] = useState(note ?? "");
  const [running, setRunning] = useState<Enums<"report_status"> | null>(null);
  const [pending, start] = useTransition();
  const set = (s: Enums<"report_status">) => {
    setRunning(s);
    start(async () => {
      const r = await adminUpdateReportAction(id, s, text);
      if (r.ok) { toast.success(d.admin.done); router.refresh(); } else toast.error(d.errors[r.error]);
    });
  };
  const closed = status === "resolved" || status === "dismissed";
  const noteId = `report-note-${id}`;
  return (
    <div>
      <Label htmlFor={noteId}>{d.admin.note}</Label>
      <Textarea id={noteId} dir="auto" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} className="min-h-20! text-sm!" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {closed && <Button size="xs" variant="outline" loading={pending && running === status} disabled={pending} onClick={() => set(status)}><Save className={icon} aria-hidden />{d.common.save}</Button>}
        {status === "open" && <Button size="xs" variant="outline" loading={pending && running === "in_review"} disabled={pending} onClick={() => set("in_review")}><Hourglass className={icon} aria-hidden />{d.admin.markInReview}</Button>}
        {status !== "resolved" && <Button size="xs" loading={pending && running === "resolved"} disabled={pending} onClick={() => set("resolved")}><CheckCircle2 className={icon} aria-hidden />{d.admin.resolve}</Button>}
        {status !== "dismissed" && <ConfirmAction action={() => adminUpdateReportAction(id, "dismissed", text)} label={d.admin.dismiss} icon={<XCircle className={icon} aria-hidden />} title={d.admin.dismissTitle} body={d.admin.dismissBody} confirmLabel={d.admin.dismiss} cancelLabel={d.admin.keep} successMessage={d.admin.done} variant="ghost" size="xs" />}
      </div>
    </div>
  );
}
