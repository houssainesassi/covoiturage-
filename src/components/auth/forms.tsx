"use client";
import { useFormAction, withNetworkError } from "@/lib/use-form-action";
import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Mail, Smartphone } from "lucide-react";
import { forgotPasswordAction, loginAction, registerAction, updatePasswordAction } from "@/actions/auth";
import { useI18n } from "@/lib/i18n/client";
import type { VerifyMethod } from "@/lib/verification";
import { Field, FormError, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/client";

const login = withNetworkError(loginAction);
const register = withNetworkError(registerAction);
const forgot = withNetworkError(forgotPasswordAction);

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(login);
  return (
    <form onSubmit={action} className="space-y-4">
      {notice && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{notice}</p>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label={d.auth.identifier} htmlFor="identifier" hint={d.auth.identifierHint}>
        <Input id="identifier" name="identifier" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required dir="ltr" />
      </Field>
      <Field label={d.auth.password} htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" />
      </Field>
      <div className="text-end"><Link href="/auth/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">{d.auth.forgotPassword}</Link></div>
      {state && !state.ok && <FormError message={d.errors[state.error]} />}
      <SubmitButton pending={pending} size="lg" className="w-full">{d.auth.loginCta}</SubmitButton>
    </form>
  );
}

/** Password field with a show/hide button, instead of a "confirm password" field. */
export function PasswordInput({ id, name, autoComplete, invalid, describedBy }: { id: string; name: string; autoComplete: string; invalid?: boolean; describedBy?: string }) {
  const { d } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name={name} type={shown ? "text" : "password"} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} required className="pe-12" aria-invalid={invalid} aria-describedby={describedBy} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? d.auth.hidePassword : d.auth.showPassword}
        aria-pressed={shown}
        className="absolute inset-y-0 end-0 flex w-12 items-center justify-center rounded-e-xl text-slate-500 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        {shown ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
}

/**
 * One-screen sign-up: phone (SMS code) or email (email code), name, password.
 * Only methods Supabase can really verify by code are offered (`methods`).
 */
export function RegisterForm({ next, methods, initial }: { next?: string; methods: VerifyMethod[]; initial: VerifyMethod }) {
  const { d } = useI18n();
  const [method, setMethod] = useState<VerifyMethod>(initial);
  const [state, action, pending] = useFormAction(register);
  // Errors belong to the method that was submitted; switching tabs clears the identifier one.
  const [errorsFor, setErrorsFor] = useState<VerifyMethod>(initial);
  const err = (k: string) => (state && !state.ok && state.fields?.[k] && (k === "fullName" || k === "password" || errorsFor === method) ? d.errors[state.fields[k]] : undefined);
  const exists = state && !state.ok && (state.fields?.email === "email_taken" || state.fields?.phone === "phone_registered") && errorsFor === method;
  const nextQ = next ? `?next=${encodeURIComponent(next)}` : "";
  const idErr = err(method);
  return (
    <form onSubmit={(e) => { setErrorsFor(method); action(e); }} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <input type="hidden" name="method" value={method} />
      {methods.length > 1 && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label={d.auth.identifier}>
          {methods.map((m) => {
            const Icon = m === "phone" ? Smartphone : Mail;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                aria-pressed={method === m}
                className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${method === m ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                <Icon className="size-4" aria-hidden />{m === "phone" ? d.auth.tabPhone : d.auth.tabEmail}
              </button>
            );
          })}
        </div>
      )}
      {method === "phone" ? (
        <Field key="phone" label={d.auth.phone} htmlFor="phone" error={idErr} hint={d.auth.signupPhoneHint}>
          <div className="flex" dir="ltr">
            <span className="flex items-center rounded-s-xl border border-e-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-600">+216</span>
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={20} placeholder="22 123 456" className="rounded-s-none" aria-invalid={!!idErr} />
          </div>
        </Field>
      ) : (
        <Field key="email" label={d.auth.email} htmlFor="email" error={idErr} hint={d.auth.signupEmailHint}>
          <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required dir="ltr" placeholder="name@example.com" aria-invalid={!!idErr} />
        </Field>
      )}
      {exists && (
        <p className="-mt-2 text-sm">
          <Link href={`/auth/login${nextQ}`} className="font-semibold text-brand-700 underline">{d.common.login}</Link>
          <span className="mx-2 text-slate-400">·</span>
          <Link href="/auth/forgot-password" className="font-semibold text-brand-700 underline">{d.auth.forgotPassword}</Link>
        </p>
      )}
      <Field label={d.auth.fullName} htmlFor="fullName" error={err("fullName")}>
        <Input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={100} aria-invalid={!!err("fullName")} />
      </Field>
      <Field label={d.auth.password} htmlFor="password" error={err("password")} hint={d.auth.passwordRules}>
        <PasswordInput id="password" name="password" autoComplete="new-password" invalid={!!err("password")} />
      </Field>
      {state && !state.ok && !state.fields && <FormError message={d.errors[state.error]} />}
      <SubmitButton pending={pending} size="lg" className="w-full">{d.auth.registerCta}</SubmitButton>
      <p className="text-center text-xs leading-relaxed text-slate-500">
        {d.auth.acceptTermsPrefix} <Link href="/terms" target="_blank" className="font-medium text-slate-700 underline">{d.auth.termsLink}</Link> {d.auth.and} <Link href="/privacy" target="_blank" className="font-medium text-slate-700 underline">{d.auth.privacyLink}</Link>.
      </p>
    </form>
  );
}

export function ForgotForm() {
  const { d } = useI18n();
  const [state, action, pending] = useFormAction(forgot);
  if (state?.ok) return <p className="rounded-xl bg-brand-50 p-4 text-sm text-brand-800">{d.auth.resetSent}</p>;
  return (
    <form onSubmit={action} className="space-y-4">
      <Field label={d.auth.identifier} htmlFor="identifier" hint={d.auth.identifierHint}>
        <Input id="identifier" name="identifier" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required dir="ltr" />
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
