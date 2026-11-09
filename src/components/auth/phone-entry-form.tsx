"use client";
import { sendPhoneOtpAction } from "@/actions/auth";
import { useFormAction, withNetworkError } from "@/lib/use-form-action";
import { useI18n } from "@/lib/i18n/client";
import type { ErrorCode } from "@/lib/errors";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/client";

const send = withNetworkError(sendPhoneOtpAction);

/** Phone step, number screen: the +216 number to text the code to. */
export function PhoneEntryForm({ next, phone, initialError }: { next: string; phone: string; initialError?: ErrorCode }) {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(send);
  const code = state ? (state.ok ? undefined : state.fields?.phone ?? state.error) : initialError;
  const error = code ? d.errors[code] : undefined;
  return (
    <form onSubmit={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field label={d.auth.phone} htmlFor="phone" error={error} hint={d.auth.phoneHint}>
        <div className="flex" dir="ltr">
          <span className="flex items-center rounded-s-xl border border-e-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">+216</span>
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required autoFocus defaultValue={phone.replace(/^\+216/, "")} placeholder="22 123 456" className="rounded-s-none" aria-invalid={!!error} />
        </div>
      </Field>
      <SubmitButton pending={pending} size="lg" className="w-full">{d.auth.sendSmsCode}</SubmitButton>
    </form>
  );
}
