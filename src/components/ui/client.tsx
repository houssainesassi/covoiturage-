"use client";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { ActionResult } from "@/lib/errors";
import { Button } from "./button";
import { Textarea, Label } from "./form";

type Variant = Parameters<typeof Button>[0]["variant"];

export function SubmitButton({ children, pendingLabel, variant, className, size, pending: forced }: { children: ReactNode; pendingLabel?: ReactNode; variant?: Variant; className?: string; size?: "sm" | "md" | "lg"; pending?: boolean }) {
  const status = useFormStatus();
  const pending = forced ?? status.pending;
  return (
    <Button type="submit" loading={pending} variant={variant} className={className} size={size}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { d } = useI18n();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-3xl bg-white p-0 shadow-2xl"
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={d.common.close}>
          <X className="size-5" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}

/**
 * Button that (optionally) asks for confirmation, then runs a server action,
 * shows a toast and refreshes server data.
 */
export function ConfirmAction({
  action,
  label,
  title,
  body,
  confirmLabel,
  cancelLabel,
  successMessage,
  variant = "outline",
  confirmVariant = "danger",
  withReason,
  skipConfirm,
  size = "sm",
  icon,
  className,
  onDone,
}: {
  action: (reason?: string) => Promise<ActionResult<unknown>>;
  label: ReactNode;
  title?: ReactNode;
  body?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  successMessage?: string | ((r: ActionResult<unknown>) => string);
  variant?: Variant;
  confirmVariant?: Variant;
  withReason?: boolean;
  skipConfirm?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  icon?: ReactNode;
  className?: string;
  onDone?: () => void;
}) {
  const { d } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const reasonId = useId();

  const run = () =>
    start(async () => {
      const res = await action(withReason ? reason : undefined);
      if (res.ok) {
        const msg = typeof successMessage === "function" ? successMessage(res) : successMessage;
        if (msg) toast.success(msg);
        setOpen(false);
        setReason("");
        onDone?.();
        router.refresh();
      } else {
        toast.error(d.errors[res.error] ?? d.errors.unknown);
      }
    });

  return (
    <>
      <Button type="button" variant={variant} size={size} loading={pending && skipConfirm} className={className} onClick={() => (skipConfirm ? run() : setOpen(true))}>
        {icon}
        {label}
      </Button>
      {!skipConfirm && (
        <Modal open={open} onClose={() => setOpen(false)} title={title ?? label}>
          {body && <p className="text-sm text-slate-600">{body}</p>}
          {withReason && (
            <div className="mt-4">
              <Label htmlFor={reasonId}>{d.bookings.reasonLabel}</Label>
              <Textarea id={reasonId} dir="auto" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={d.bookings.reasonPlaceholder} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {cancelLabel ?? d.common.cancel}
            </Button>
            <Button type="button" variant={confirmVariant} loading={pending} onClick={run}>
              {confirmLabel ?? d.common.confirm}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Shows a toast for `?toast=<key>` after a redirect, then removes the param. */
export function FlashToast() {
  const { d } = useI18n();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const key = params.get("toast");
  useEffect(() => {
    if (!key) return;
    const messages: Record<string, string> = {
      trip_created: d.driverTrips.created,
      trip_updated: d.driverTrips.updated,
      vehicle_saved: d.vehicles.saved,
      rental_saved: d.rentals.saved,
      password: d.auth.passwordUpdated,
      password_reset: d.auth.passwordResetDone,
      email_changed: d.settings.emailChanged,
      email_change_pending: d.settings.emailChangePending,
      confirmed: d.auth.emailConfirmed,
    };
    if (messages[key]) toast.success(messages[key]);
    const next = new URLSearchParams(params);
    next.delete("toast");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [key, d, params, pathname, router]);
  return null;
}
