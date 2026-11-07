"use client";
import { useFormAction } from "@/lib/use-form-action";
import { updateEmailAction } from "@/actions/auth";
import { useI18n } from "@/lib/i18n/client";
import { Field, FormError, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/client";

export function EmailForm() {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(updateEmailAction);
  return (
    <form onSubmit={action} className="space-y-3">
      <Field label={d.settings.changeEmail} htmlFor="new-email" hint={d.settings.emailHint}>
        <Input id="new-email" name="email" type="email" required dir="ltr" />
      </Field>
      {state?.ok && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{d.settings.emailChangeSent}</p>}
      {state && !state.ok && <FormError message={d.errors[state.error]} />}
      <SubmitButton pending={pending} variant="outline">{d.settings.changeEmail}</SubmitButton>
    </form>
  );
}
