"use client";
import { useFormAction } from "@/lib/use-form-action";
import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { reportAction } from "@/actions/reports";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/format";
import { Field, FormError, Select, Textarea } from "@/components/ui/form";
import { Modal, SubmitButton } from "@/components/ui/client";

export function ReportDialog({ userId, name, tripId, messageId, reviewId, compact }: { userId: string; name: string; tripId?: string; messageId?: string; reviewId?: string; compact?: boolean }) {
  const { d } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useFormAction(async (prev: Awaited<ReturnType<typeof reportAction>> | null, fd: FormData) => {
    const res = await reportAction(prev, fd);
    if (res.ok) {
      toast.success(d.report.sent);
      setOpen(false);
    }
    return res;
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={compact ? "rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600" : "inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-red-600"} aria-label={d.trip.report}>
        <Flag className="size-4" aria-hidden />{!compact && d.trip.report}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={fmt(d.report.title, { name })}>
        <form onSubmit={action} className="space-y-4">
          <p className="text-sm text-slate-500">{d.report.subtitle}</p>
          <input type="hidden" name="reportedUserId" value={userId} />
          {tripId && <input type="hidden" name="tripId" value={tripId} />}
          {messageId && <input type="hidden" name="messageId" value={messageId} />}
          {reviewId && <input type="hidden" name="reviewId" value={reviewId} />}
          <Field label={d.report.reason} htmlFor="report-reason">
            <Select id="report-reason" name="reason" required defaultValue="inappropriate_behavior">
              {Object.entries(d.report.reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label={d.report.details} htmlFor="report-details" optional={d.common.optional}>
            <Textarea id="report-details" name="details" maxLength={2000} placeholder={d.report.detailsPlaceholder} />
          </Field>
          {state && !state.ok && <FormError message={d.errors[state.error]} />}
          <div className="flex justify-end"><SubmitButton pending={pending} variant="danger">{d.report.submit}</SubmitButton></div>
        </form>
      </Modal>
    </>
  );
}
