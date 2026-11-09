"use client";
import { startTransition, useActionState, useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { resendEmailOtpAction, resendPhoneOtpAction, resendSmsOtpAction, verifyEmailOtpAction, verifyPhoneOtpAction, verifySmsOtpAction } from "@/actions/auth";
import { SMS_CODE_TTL_SECONDS, SMS_RESEND_SECONDS } from "@/lib/phone";
import { withNetworkError } from "@/lib/use-form-action";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/format";
import { FormError, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import type { ActionResult, ErrorCode } from "@/lib/errors";

const LENGTH = 6;
const RESEND_SECONDS = SMS_RESEND_SECONDS;
const EMPTY = Array<string>(LENGTH).fill("");

const actions = {
  email: { verify: withNetworkError(verifyEmailOtpAction), resend: withNetworkError(resendEmailOtpAction) },
  phone: { verify: withNetworkError(verifyPhoneOtpAction), resend: withNetworkError(resendPhoneOtpAction) },
  sms: { verify: withNetworkError(verifySmsOtpAction), resend: withNetworkError(resendSmsOtpAction) },
};

/** Keeps digits only; Arabic keyboards type ٠-٩, which the server would refuse. */
const toDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/\D/g, "");

/**
 * 6-digit code screen: the email code (`email`), the SMS code adding a number to
 * the signed-in account (`phone`), or with `purpose` the SMS code of a phone
 * account (sign-up confirmation or password reset, no session yet).
 */
export function VerifyOtpForm({ email, phone, next, purpose }: { email?: string; phone?: string; next: string; purpose?: "signup" | "recovery" }) {
  const { d } = useI18n();
  const channel = phone ? "phone" : "email";
  const target = { name: channel, value: (phone ?? email)! };
  const { verify, resend } = actions[phone && purpose ? "sms" : channel];
  const setPurpose = (fd: FormData) => purpose && fd.set("purpose", purpose);
  // When the current code was sent, to tell an expired SMS code from a wrong one.
  const sentAt = useRef(0);
  const [digits, setDigits] = useState(EMPTY);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const [, dispatchVerify, verifying] = useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const result = await verify(prev, fd);
    if (!result.ok) {
      const expired = channel === "phone" && result.error === "otp_invalid" && sentAt.current > 0 && Date.now() - sentAt.current > SMS_CODE_TTL_SECONDS * 1000;
      setError(expired ? "otp_expired" : result.error);
      setDigits(EMPTY);
      inputs.current[0]?.focus();
    }
    return result;
  }, null);

  const [, dispatchResend, resending] = useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const result = await resend(prev, fd);
    setResent(result.ok);
    setError(result.ok ? null : result.error);
    if (result.ok || result.error === "rate_limited") setSecondsLeft(RESEND_SECONDS);
    if (result.ok) {
      sentAt.current = Date.now();
      setDigits(EMPTY);
      inputs.current[0]?.focus();
    }
    return result;
  }, null);

  useEffect(() => {
    if (!sentAt.current) sentAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const submit = (code: string) => {
    if (code.length !== LENGTH || verifying) return;
    setResent(false);
    setError(null);
    const fd = new FormData();
    fd.set(target.name, target.value);
    fd.set("next", next);
    fd.set("token", code);
    setPurpose(fd);
    startTransition(() => dispatchVerify(fd));
  };

  /** Writes digits from `index` on (one keystroke, a paste, or an SMS/email autofill). */
  const fill = (index: number, value: string) => {
    const updated = [...digits];
    const chars = value.slice(0, LENGTH - index).split("");
    chars.forEach((c, i) => (updated[index + i] = c));
    setDigits(updated);
    inputs.current[Math.min(index + chars.length, LENGTH - 1)]?.focus();
    submit(updated.join(""));
  };

  const onChange = (index: number, raw: string) => {
    let value = toDigits(raw);
    // Typing into a filled box leaves two digits: keep the new one.
    if (value.length === 2 && digits[index]) value = value.replace(digits[index], "") || digits[index];
    if (value) fill(index, value);
    else setDigits(digits.map((c, i) => (i === index ? "" : c)));
  };

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      setDigits(digits.map((c, i) => (i === index - 1 ? "" : c)));
      inputs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < LENGTH - 1) {
      e.preventDefault();
      inputs.current[index + 1]?.focus();
    }
  };

  const onPaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const value = toDigits(e.clipboardData.getData("text"));
    if (value) fill(index, value);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submit(digits.join(""));
  };

  const onResend = () => {
    const fd = new FormData();
    fd.set(target.name, target.value);
    setPurpose(fd);
    startTransition(() => dispatchResend(fd));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {/* Digits read left to right in every language, including Arabic. */}
      <div dir="ltr" className="flex justify-center gap-2">
        {digits.map((digit, i) => (
          <Input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={digit}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onFocus={(e) => e.target.select()}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={i === 0}
            maxLength={LENGTH}
            readOnly={verifying}
            aria-label={fmt(d.auth.verifyDigit, { n: i + 1 })}
            aria-invalid={error === "otp_invalid" || error === "otp_expired"}
            className="min-w-0 max-w-12 px-0! text-center text-xl! font-bold"
          />
        ))}
      </div>
      <p className="text-center text-sm text-slate-500">{channel === "phone" ? d.auth.smsHint : d.auth.verifyHint}</p>
      {error && <FormError message={d.errors[error]} />}
      {resent && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{d.auth.codeResent}</p>}
      <SubmitButton pending={verifying} size="lg" className="w-full">{channel === "phone" ? d.auth.verifyPhoneCta : d.auth.verifyCta}</SubmitButton>
      <Button type="button" variant="ghost" className="w-full" disabled={secondsLeft > 0} loading={resending} onClick={onResend}>
        {secondsLeft > 0 ? fmt(d.auth.resendIn, { seconds: secondsLeft }) : d.auth.resendCode}
      </Button>
    </form>
  );
}
