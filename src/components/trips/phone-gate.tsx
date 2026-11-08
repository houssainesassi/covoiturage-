"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { savePhoneAction } from "@/actions/profile";
import { useI18n } from "@/lib/i18n/client";
import { useFormAction } from "@/lib/use-form-action";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/client";
import { Field, Input } from "@/components/ui/form";

/** Shown instead of the ride form until the driver has a valid phone number. */
export function PhoneGate() {
  const { d } = useI18n();
  const router = useRouter();
  const [state, action, pending] = useFormAction(savePhoneAction);
  useEffect(() => {
    if (state?.ok) {
      toast.success(d.tripForm.phoneGate.saved);
      router.refresh();
    }
  }, [state, d, router]);
  const error = state && !state.ok ? d.errors[state.fields?.phone ?? state.error] : undefined;
  return (
    <Card className="mx-auto max-w-lg p-5 sm:p-7">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-100 text-accent-600"><PhoneCall className="size-6" aria-hidden /></span>
      <h2 className="mt-4 text-xl font-bold text-slate-900">{d.tripForm.phoneGate.title}</h2>
      <p className="mt-1.5 text-slate-600">{d.tripForm.phoneGate.body}</p>
      <form onSubmit={action} className="mt-5 space-y-4">
        <Field label={d.auth.phone} htmlFor="phone" error={error} hint={d.auth.phoneHint}>
          <div className="flex" dir="ltr">
            <span className="flex items-center rounded-s-xl border border-e-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">+216</span>
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required placeholder="22 123 456" className="rounded-s-none" aria-invalid={!!error} aria-describedby={error ? "phone-error" : undefined} />
          </div>
        </Field>
        <SubmitButton pending={pending} size="lg" className="w-full">{d.tripForm.phoneGate.cta}</SubmitButton>
      </form>
    </Card>
  );
}
