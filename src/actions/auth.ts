"use server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, toErrorCode, type ActionResult } from "@/lib/errors";
import { emailCodeSchema, loginSchema, passwordSchema, registerSchema } from "@/lib/validation";
import { normalizeTunisianPhone } from "@/lib/phone";
import { emailVerificationEnabled } from "@/lib/auth-settings";
import { getOrigin, getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/env";
import { z } from "zod";

const WINDOW_MS = 10 * 60 * 1000;
const emailField = z.string().trim().toLowerCase().email().max(254);

async function guard(key: string, max: number) {
  if (!isSupabaseConfigured()) return fail("not_configured");
  const ip = await getClientIp();
  if (!rateLimit(`${key}:${ip}`, max, WINDOW_MS)) return fail("rate_limited");
  return null;
}

/** Where a new account lands after confirming its email: the profile step, then `next`. */
function afterConfirm(next: string) {
  const target = next.startsWith("/auth") ? "/" : next;
  return `/auth/complete-profile?next=${encodeURIComponent(target)}`;
}

/** `sentAt` (ms): when Supabase sent the last email, so the resend countdown survives a reload. */
const checkEmailUrl = (email: string, next: string, unconfirmed = false, sentAt?: number) =>
  `/auth/check-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}${unconfirmed ? "&unconfirmed=1" : ""}${sentAt ? `&sent=${sentAt}` : ""}`;

/** Supabase's per-address limit ("only request this after 42 seconds"): an email went out moments ago. */
function secondsUntilResend(error: { code?: string; message?: string }) {
  if (error.code !== "over_email_send_rate_limit") return null;
  const m = /after (\d+) seconds?/i.exec(error.message ?? "");
  return m ? Number(m[1]) : null;
}

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("login", 20);
  if (blocked) return blocked;
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return fail("invalid_credentials");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const code = toErrorCode(error);
    // Right password, email never confirmed: offer a new link. No account is created.
    if (code === "email_not_confirmed") redirect(checkEmailUrl(parsed.data.email, safeNext(String(fd.get("next") ?? ""), "/"), true));
    return fail(code);
  }
  revalidatePath("/", "layout");
  redirect(safeNext(String(fd.get("next") ?? "")));
}

export async function registerAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("register", 8);
  if (blocked) return blocked;
  const raw = {
    fullName: fd.get("fullName"),
    email: fd.get("email"),
    phone: fd.get("phone") ?? "",
    password: fd.get("password"),
    terms: fd.get("terms"),
  };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, ReturnType<typeof toErrorCode>> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0]);
      fields[k] = k === "email" ? "invalid_email" : k === "password" ? "weak_password" : k === "terms" ? "terms_required" : k === "phone" ? "phone_required" : "validation";
    }
    if (!fields.phone && !normalizeTunisianPhone(String(raw.phone))) fields.phone = "invalid_phone";
    return fail(fields.terms ?? "validation", fields);
  }
  const v = parsed.data;
  const phone = normalizeTunisianPhone(v.phone);
  if (!phone) return fail("invalid_phone", { phone: "invalid_phone" });
  // Every new account must confirm its email. If Supabase would auto-confirm it, refuse to create it.
  if (!(await emailVerificationEnabled())) return fail("signup_unavailable");

  const supabase = await createClient();
  const origin = await getOrigin();
  const next = safeNext(String(fd.get("next") ?? ""), "/");
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      // return_to: where /auth/confirm sends the user after the profile step (read back with safeNext).
      data: { full_name: v.fullName, phone, locale: await getLocale(), return_to: next },
      // Used only by the default Supabase template ({{ .ConfirmationURL }}); ours links to /auth/confirm.
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(afterConfirm(next))}`,
    },
  });
  if (error) {
    // Same unconfirmed address signed up again within a minute: Supabase sent its email moments ago
    // and refuses another, so continue to the "check your email" screen (no new account is created).
    const wait = secondsUntilResend(error);
    if (wait !== null) redirect(checkEmailUrl(v.email, next, false, Date.now() - Math.max(0, 60 - wait) * 1000));
    return fail(toErrorCode(error), toErrorCode(error) === "email_taken" ? { email: "email_taken" } : undefined);
  }
  // With email confirmation enabled, an existing confirmed address returns a user without identities.
  if (data.user && data.user.identities?.length === 0) return fail("email_taken", { email: "email_taken" });
  if (data.session) {
    // Confirm email was switched off between the check above and signUp: never keep an unverified session.
    console.error("[auth] sign-up returned a session: 'Confirm email' is off in Supabase Auth");
    await supabase.auth.signOut();
    return fail("signup_unavailable");
  }
  redirect(checkEmailUrl(v.email, next, false, Date.now()));
}

/** "Resend the confirmation email" on /auth/check-email. Same answer whether or not the address exists. */
export async function resendConfirmationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("resend", 6);
  if (blocked) return blocked;
  const email = emailField.safeParse(fd.get("email"));
  if (!email.success) return fail("invalid_email", { email: "invalid_email" });
  // Per address too, so one inbox cannot be flooded from many IPs. Supabase adds 60 s per user.
  if (!rateLimit(`resend-email:${email.data}`, 3, WINDOW_MS)) return fail("rate_limited");
  const supabase = await createClient();
  const origin = await getOrigin();
  const next = safeNext(String(fd.get("next") ?? ""), "/");
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.data,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(afterConfirm(next))}` },
  });
  if (error) {
    const code = toErrorCode(error);
    if (code === "rate_limited" || code === "email_send_failed" || code === "network_error") return fail(code);
    // Unknown or already confirmed address: answer as if sent, so the form cannot test addresses.
  }
  return { ok: true };
}

/**
 * Code form on /auth/check-email: the 8-digit {{ .Token }} from the sign-up email.
 * verifyOtp type "email" confirms the address and starts the session on this device.
 * Wrong, expired and used codes get one answer, so the form cannot test addresses.
 */
export async function verifySignupCodeAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("verify-code", 30);
  if (blocked) return blocked;
  const email = emailField.safeParse(fd.get("email"));
  if (!email.success) return fail("invalid_email", { email: "invalid_email" });
  const token = emailCodeSchema.safeParse(String(fd.get("code") ?? ""));
  if (!token.success) return fail("otp_invalid", { code: "otp_invalid" });
  // Per address too: 10 guesses per 10 min against a 10^8 code space, on top of Supabase's own limit.
  if (!rateLimit(`verify-code-email:${email.data}`, 10, WINDOW_MS)) return fail("rate_limited");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: email.data, token: token.data, type: "email" });
  if (error) {
    const code = toErrorCode(error);
    if (code === "rate_limited" || code === "network_error") return fail(code);
    return fail("otp_invalid", { code: "otp_invalid" });
  }
  if (!data.user || !data.session) return fail("otp_invalid", { code: "otp_invalid" });
  revalidatePath("/", "layout");
  const returnTo = safeNext(typeof data.user.user_metadata?.return_to === "string" ? data.user.user_metadata.return_to : "", "/");
  redirect(`${afterConfirm(returnTo)}&toast=confirmed`);
}

const LINK_TYPES =["signup", "email", "recovery", "email_change"] as const satisfies readonly EmailOtpType[];

/**
 * Button on /auth/confirm. The link in the email only opens a page; the token is
 * used when the person presses the button, so mail scanners that open links
 * (Outlook Safe Links, antivirus) cannot use it up. Works on any device: no
 * PKCE verifier from the browser that signed up is needed.
 */
export async function confirmEmailLinkAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("confirm", 20);
  if (blocked) return blocked;
  const tokenHash = z.string().min(10).max(200).safeParse(fd.get("token_hash"));
  const type = z.enum(LINK_TYPES).safeParse(fd.get("type"));
  if (!tokenHash.success || !type.success) return fail("link_invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: type.data, token_hash: tokenHash.data });
  if (error) return fail(toErrorCode(error) === "rate_limited" ? "rate_limited" : "link_invalid");
  revalidatePath("/", "layout");
  if (type.data === "email_change") {
    // With "Secure email change", the first of the two links is accepted without a session: the change stays pending.
    redirect(`/dashboard/settings?toast=${!data.user || data.user.new_email ? "email_change_pending" : "email_changed"}`);
  }
  if (!data.user) return fail("link_invalid");
  if (type.data === "recovery") redirect("/auth/reset-password");
  const returnTo = safeNext(typeof data.user.user_metadata?.return_to === "string" ? data.user.user_metadata.return_to : "", "/");
  redirect(`${afterConfirm(returnTo)}&toast=confirmed`);
}

export async function forgotPasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("forgot", 5);
  if (blocked) return blocked;
  const email = emailField.safeParse(fd.get("email"));
  if (!email.success) return fail("invalid_email");
  if (!rateLimit(`forgot-email:${email.data}`, 3, WINDOW_MS)) return fail("rate_limited");
  const supabase = await createClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    // Used only by the default template; ours links to /auth/confirm?type=recovery.
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  });
  if (error && toErrorCode(error) === "rate_limited") return fail("rate_limited");
  // Always succeed to avoid revealing whether the email exists.
  return { ok: true };
}

export async function updatePasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const pw = passwordSchema.safeParse(fd.get("password"));
  if (!pw.success) return fail("weak_password", { password: "weak_password" });
  if (pw.data !== fd.get("confirm")) return fail("password_mismatch", { confirm: "password_mismatch" });
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return fail("not_authenticated");
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return fail(toErrorCode(error));
  if (fd.get("redirect") === "1") {
    // Password recovery: end every session of this account (all devices), then log in again.
    await supabase.auth.signOut({ scope: "global" });
    revalidatePath("/", "layout");
    redirect("/auth/login?toast=password_reset");
  }
  return { ok: true };
}

export async function updateEmailAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = emailField.safeParse(fd.get("email"));
  if (!email.success) return fail("invalid_email");
  const ip = await getClientIp();
  if (!rateLimit(`email-change:${ip}`, 5, WINDOW_MS)) return fail("rate_limited");
  const supabase = await createClient();
  const origin = await getOrigin();
  const { error } = await supabase.auth.updateUser(
    { email: email.data },
    { emailRedirectTo: `${origin}/auth/callback?next=/dashboard/settings` },
  );
  if (error) return fail(toErrorCode(error));
  return { ok: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
