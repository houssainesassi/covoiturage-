import { Ban, Check, CheckCircle2, Clock, Flag, XCircle } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import type { BookingStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const styles: Record<BookingStatus, { icon: typeof Clock; box: string; iconColor: string }> = {
  pending: { icon: Clock, box: "border-amber-200 bg-amber-50 text-amber-950", iconColor: "text-amber-600" },
  confirmed: { icon: CheckCircle2, box: "border-emerald-200 bg-emerald-50 text-emerald-950", iconColor: "text-emerald-600" },
  rejected: { icon: XCircle, box: "border-red-200 bg-red-50 text-red-950", iconColor: "text-red-600" },
  cancelled: { icon: Ban, box: "border-slate-200 bg-slate-50 text-slate-800", iconColor: "text-slate-500" },
  completed: { icon: Flag, box: "border-sky-200 bg-sky-50 text-sky-950", iconColor: "text-sky-600" },
};

/** Says in plain words where a booking stands and what happens next. */
export function BookingStatusNotice({ status, d, className }: { status: BookingStatus; d: Dictionary; className?: string }) {
  const s = styles[status];
  const info = d.bookings.info[status];
  const showSteps = status === "pending" || status === "confirmed";
  const steps = [d.bookings.steps.sent, d.bookings.steps.driver, d.bookings.steps.confirmed];
  const done = status === "confirmed" ? 3 : 1;
  return (
    <div role="status" className={cn("rounded-2xl border p-4", s.box, className)}>
      <p className="flex items-start gap-2.5 font-bold"><s.icon className={cn("mt-0.5 size-5 shrink-0", s.iconColor)} aria-hidden />{info.title}</p>
      <p className="mt-1 text-sm opacity-90">{info.body}</p>
      {showSteps && (
        <ol className="mt-3 grid grid-cols-3 gap-1.5">
          {steps.map((label, i) => {
            const complete = i < done;
            const current = i === done;
            return (
              <li key={label} aria-current={current ? "step" : undefined} className="text-center text-xs font-semibold leading-snug">
                <span className={cn("mx-auto mb-1 flex size-6 items-center justify-center rounded-full text-xs", complete ? "bg-emerald-600 text-white" : current ? "bg-amber-500 text-white" : "bg-white text-slate-400 ring-1 ring-slate-300")}>
                  {complete ? <Check className="size-3.5" aria-hidden /> : i + 1}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
