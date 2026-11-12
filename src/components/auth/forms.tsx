"use client";
import { useFormAction, withNetworkError } from "@/lib/use-form-action";
import Link from "next/link";
import { useEffect, useState } from "react";
import { confirmEmailLinkAction, forgotPasswordAction, loginAction, registerAction, resendConfirmationAction, updatePasswordAction } from "@/actions/auth";
import { fmt } from "@/lib/i18n/format";
import { useI18n } from "@/lib/i18n/client";
import { Checkbox, Field, FormError, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/client";
import { Button } from "@/components/ui/button";

const login = withNetworkError(loginAction);
const register = withNetworkError(registerAction);
const forgot = withNetworkError(forgotPasswordAction);
const resend = withNetworkError(resendConfirmationAction);
const confirmLink = withNetworkError(confirmEmailLinkAction);
const RESEND_SECONDS = 60;

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(login);
  return (
    <form onSubmit={action} className="space-y-4">
      {notice && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{notice}</p>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label={d.auth.email} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
      </Field>
      <Field label={d.auth.password} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="text-end"><Link href="/auth/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">{d.auth.forgotPassword}</Link></div>
      {state && !state.ok && <FormError message={d.errors[state.error]} />}
      <SubmitButton pending={pending} size="lg" className="w-full">{d.auth.loginCta}</SubmitButton>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(register);
  const err = (k: string) => (state && !state.ok && state.fields?.[k] ? d.errors[state.fields[k]] : undefined);
  return (
    <form onSubmit={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label={d.auth.fullName} htmlFor="fullName" error={err("fullName")}>
        <Input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={100} aria-invalid={!!err("fullName")} />
      </Field>
      <Field label={d.auth.email} htmlFor="email" error={err("email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" aria-invalid={!!err("email")} />
      </Field>
      <Field label={d.auth.phone} htmlFor="phone" error={err("phone")} hint={d.auth.phoneHint}>
        <div className="flex" dir="ltr">
          <span className="flex items-center rounded-s-xl border border-e-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">+216</span>
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={20} placeholder="22 123 456" className="rounded-s-none" aria-invalid={!!err("phone")} />
        </div>
      </Field>
      <Field label={d.auth.password} htmlFor="password" error={err("password")} hint={d.auth.passwordRules}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} aria-invalid={!!err("password")} />
      </Field>
      <Field label={d.auth.confirmPassword} htmlFor="confirm" error={err("confirm")}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={!!err("confirm")} />
      </Field>
      <Checkbox
        name="terms"
        required
        label={<>{d.auth.acceptTermsPrefix} <Link href="/terms" target="_blank" className="font-medium text-brand-700 underline">{d.auth.termsLink}</Link> {d.auth.and} <Link href="/privacy" target="_blank" className="font-medium text-brand-700 underline">{d.auth.privacyLink}</Link></>}
      />
      {state && !state.ok && <FormError message={d.errors[state.error]} />}
      <SubmitButton pending={pending} size="lg" className="w-full">{d.auth.registerCta}</SubmitButton>
    </form>
  );
}

export function ForgotForm() {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(forgot);
  if (state?.ok) return <p className="rounded-xl bg-brand-50 p-4 text-sm text-brand-800">{d.auth.resetSent}</p>;
  return (
    <form onSubmit={action} className="space-y-4">
      <Field label={d.auth.email} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
      </Field>
      {state && !state.ok && <FormError message={d.errors[state.error]} />}
      <SubmitButton pending={pending} size="lg" className="w-full">{d.auth.sendResetLink}</SubmitButton>
    </form>
  );
}

export function NewPasswordForm({ redirectAfter }: { redirectAfter?: boolean }) {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(updatePasswordAction);
  const err = (k: string) => (state && !state.ok && state.fields?.[k] ? d.errors[state.fields[k]] : undefined);
  return (
    <form onSubmit={action} className="space-y-4">
      {redirectAfter && <input type="hidden" name="redirect" value="1" />}
      <Field label={d.auth.newPassword} htmlFor="password" error={err("password")} hint={d.auth.passwordRules}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label={d.auth.confirmPassword} htmlFor="confirm" error={err("confirm")}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      {state?.ok && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{d.settings.passwordSaved}</p>}
      {state && !state.ok && !state.fields && <FormError message={d.errors[state.error]} />}
      <SubmitButton pending={pending} size="lg" className="w-full">{d.auth.updatePassword}</SubmitButton>
    </form>
  );
}

/** "Resend the email" on /auth/check-email, with a 60 s wait between sends (Supabase refuses faster resends). */
export function ResendConfirmationForm({ email, next, startLocked }: { email: string; next?: string; startLocked?: boolean }) {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(resend);
  const [wait, setWait] = useState(startLocked ? RESEND_SECONDS : 0);
  // Restart the wait after each successful send (state adjusted during render, not in an effect).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setWait(RESEND_SECONDS);
  }
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const err = state && !state.ok ? d.errors[state.fields?.email ?? state.error] : undefined;
  return (
    <form onSubmit={action} className="space-y-3">
      <input type="hidden" name="next" value={next ?? ""} />
      {email ? (
        <input type="hidden" name="email" value={email} />
      ) : (
        <Field label={d.auth.email} htmlFor="resend-email">
          <Input id="resend-email" name="email" type="email" autoComplete="email" required dir="ltr" />
        </Field>
      )}
      {state?.ok && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{d.auth.resendSent}</p>}
      {err && <FormError message={err} />}
      <Button type="submit" variant="outline" className="w-full" loading={pending} disabled={pending || wait > 0}>
        {wait > 0 ? fmt(d.auth.resendIn, { seconds: String(wait) }) : d.auth.resendEmail}
      </Button>
    </form>
  );
}

/** One button on /auth/confirm: the token from the email link is used only when pressed. */
export function ConfirmLinkForm({ tokenHash, type, label }: { tokenHash: string; type: string; label: string }) {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(confirmLink);
  return (
    <form onSubmit={action} className="space-y-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      {state && !state.ok && (
        <div className="space-y-2">
          <FormError message={d.errors[state.error]} />
          {state.error === "link_invalid" && (
            <p className="text-sm">
              <Link href={type === "recovery" ? "/auth/forgot-password" : "/auth/check-email"} className="font-semibold text-brand-700 hover:underline">
                {type === "recovery" ? d.auth.sendResetLink : d.auth.resendEmail}
              </Link>
            </p>
          )}
        </div>
      )}
      <SubmitButton pending={pending} size="lg" className="w-full">{label}</SubmitButton>
    </form>
  );
}
