"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fail, toErrorCode, type ActionResult } from "@/lib/errors";
import { loginSchema, passwordSchema, registerSchema } from "@/lib/validation";
import { normalizeTunisianPhone } from "@/lib/phone";
import { parseMethod } from "@/lib/verification";
import { sendPhoneCode, signupSmsAllowed, smsHourlyAllowed, verifyPhoneUrl } from "@/lib/phone-otp";
import { savePrivateProfile } from "./_util";
import { getOrigin, getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { isSupabaseConfigured } from "@/lib/env";
import { z } from "zod";

async function guard(key: string, max: number) {
  if (!isSupabaseConfigured()) return fail("not_configured");
  const ip = await getClientIp();
  if (!rateLimit(`${key}:${ip}`, max, 10 * 60 * 1000)) return fail("rate_limited");
  return null;
}

const OTP_WINDOW_MS = 10 * 60 * 1000;
const emailField = z.string().trim().toLowerCase().email();

const verifyUrl = (email: string, next: string) =>
  `/auth/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`;

/** Code screen for an SMS sent to a phone account: at sign-up, or to reset its password. */
const verifySmsUrl = (phone: string, next: string, purpose: "signup" | "recovery" = "signup") =>
  `/auth/verify?phone=${encodeURIComponent(phone)}&purpose=${purpose}&next=${encodeURIComponent(next)}`;

const completeProfileUrl = (next: string, flag: "verified" | "phone_verified") =>
  `/auth/complete-profile?${flag}=1&next=${encodeURIComponent(safeNext(next, "/"))}`;

const phoneInput = (fd: FormData) => normalizeTunisianPhone(String(fd.get("phone") ?? ""));

/** "22 123 456", "+216…" → phone; anything with an @ → email. */
function parseIdentifier(raw: FormDataEntryValue | null): { email: string } | { phone: string } | null {
  const v = String(raw ?? "").trim();
  if (v.includes("@")) {
    const email = emailField.safeParse(v);
    return email.success ? { email: email.data } : null;
  }
  const phone = normalizeTunisianPhone(v);
  return phone ? { phone } : null;
}

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("login", 20);
  if (blocked) return blocked;
  // Email accounts and phone accounts (+216) both sign in with their password.
  const id = parseIdentifier(fd.get("identifier") ?? fd.get("email"));
  const password = loginSchema.shape.password.safeParse(fd.get("password"));
  if (!id || !password.success) return fail("invalid_credentials");
  const next = safeNext(String(fd.get("next") ?? ""));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ ...id, password: password.data });
  if (error) {
    const code = toErrorCode(error);
    if (code !== "email_not_confirmed" && code !== "phone_not_confirmed") return fail(code);
    // Right password, unverified account: the earlier code may have expired, so send a new one.
    const after = safeNext(String(fd.get("next") ?? ""), "/");
    if ("email" in id) {
      await supabase.auth.resend({ type: "signup", email: id.email });
      redirect(verifyUrl(id.email, after));
    }
    if (signupSmsAllowed(id.phone)) await supabase.auth.resend({ type: "sms", phone: id.phone });
    redirect(verifySmsUrl(id.phone, after));
  }
  revalidatePath("/", "layout");
  redirect(next);
}

export async function registerAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("register", 8);
  if (blocked) return blocked;
  const method = parseMethod(fd.get("method"));
  if (!method) return fail("validation");
  const raw = {
    fullName: fd.get("fullName"),
    // The email is asked only when the user chose to verify by email.
    email: method === "email" ? fd.get("email") : undefined,
    phone: fd.get("phone") ?? "",
    password: fd.get("password"),
    confirm: fd.get("confirm"),
    terms: fd.get("terms"),
  };
  const parsed = registerSchema(method).safeParse(raw);
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
  if (v.password !== v.confirm) return fail("password_mismatch", { confirm: "password_mismatch" });
  const phone = normalizeTunisianPhone(v.phone);
  if (!phone) return fail("invalid_phone", { phone: "invalid_phone" });
  const supabase = await createClient();
  const after = safeNext(String(fd.get("next") ?? ""), "/");
  const data = { full_name: v.fullName, phone, locale: await getLocale() };

  if (method === "phone") {
    if (!smsHourlyAllowed(phone)) return fail("rate_limited");
    // Supabase sends the 6-digit SMS code ("Confirm phone" on); verified with type 'sms'.
    const res = await supabase.auth.signUp({ phone, password: v.password, options: { data } });
    if (res.error) {
      if (res.error.code === "over_sms_send_rate_limit" && /after \d+ seconds?/i.test(res.error.message)) redirect(verifySmsUrl(phone, after));
      // Auth reports an existing phone account as "user_already_exists" too.
      const code = toErrorCode(res.error) === "email_taken" ? "phone_taken" : toErrorCode(res.error);
      return fail(code, code === "phone_taken" ? { phone: code } : undefined);
    }
    // A number already registered comes back as a user without identities.
    if (res.data.user && res.data.user.identities?.length === 0) return fail("phone_taken", { phone: "phone_taken" });
    if (res.data.session) {
      console.error("[auth] phone signup skipped SMS verification: enable phone confirmations in Supabase");
      revalidatePath("/", "layout");
      redirect(completeProfileUrl(after, "phone_verified"));
    }
    redirect(verifySmsUrl(phone, after));
  }

  const email = v.email!;
  const origin = await getOrigin();
  const next = safeNext(String(fd.get("next") ?? ""));
  const res = await supabase.auth.signUp({
    email,
    password: v.password,
    options: { data, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (res.error) {
    // This address was sent a code seconds ago, so carry on to the code page. The project-wide
    // email limit has the same code but a different message, and no code is on its way then.
    if (res.error.code === "over_email_send_rate_limit" && /after \d+ seconds?/i.test(res.error.message)) redirect(verifyUrl(email, after));
    const code = toErrorCode(res.error);
    return fail(code, code === "email_taken" ? { email: code } : undefined);
  }
  // With email confirmation enabled, an existing address returns a user without identities.
  if (res.data.user && res.data.user.identities?.length === 0) return fail("email_taken", { email: "email_taken" });
  if (res.data.session) {
    // A session here means Supabase auto-confirmed the account and sent no code.
    console.error("[auth] signup skipped email verification: enable Confirm email in Supabase");
    revalidatePath("/", "layout");
    redirect(completeProfileUrl(after, "verified"));
  }
  redirect(verifyUrl(email, after));
}

export async function verifyEmailOtpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("verify", 20);
  if (blocked) return blocked;
  const email = emailField.safeParse(fd.get("email"));
  const token = z.string().regex(/^\d{6}$/).safeParse(fd.get("token"));
  if (!email.success || !token.success) return fail("otp_invalid");
  // Per-address limit too, so guessing one account's code from many IPs stays slow.
  if (!rateLimit(`verify-email:${email.data}`, 10, OTP_WINDOW_MS)) return fail("rate_limited");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: token.data, type: "email" });
  if (error) return fail(toErrorCode(error));
  revalidatePath("/", "layout");
  redirect(completeProfileUrl(String(fd.get("next") ?? ""), "verified"));
}

/** SMS code of a phone account: confirms the sign-up, or signs in to reset the password. */
export async function verifySmsOtpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("verify", 20);
  if (blocked) return blocked;
  const phone = phoneInput(fd);
  const token = z.string().regex(/^\d{6}$/).safeParse(fd.get("token"));
  if (!phone || !token.success) return fail("otp_invalid");
  if (!rateLimit(`verify-phone:${phone}`, 10, OTP_WINDOW_MS)) return fail("rate_limited");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token: token.data, type: "sms" });
  if (error) return fail(toErrorCode(error));
  revalidatePath("/", "layout");
  if (fd.get("purpose") === "recovery") redirect("/auth/reset-password");
  redirect(completeProfileUrl(String(fd.get("next") ?? ""), "phone_verified"));
}

export async function resendSmsOtpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("sms", 10);
  if (blocked) return blocked;
  const phone = phoneInput(fd);
  if (!phone) return fail("invalid_phone");
  if (!signupSmsAllowed(phone)) return fail("rate_limited");
  const supabase = await createClient();
  const { error } =
    fd.get("purpose") === "recovery"
      ? await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } })
      : await supabase.auth.resend({ type: "sms", phone });
  // Unknown number on recovery: same answer as a sent code, so numbers can't be probed.
  if (error?.code === "otp_disabled" && fd.get("purpose") === "recovery") return { ok: true };
  if (error) return fail(toErrorCode(error));
  return { ok: true };
}

async function signedInUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

/** Phone step, number screen: texts a code, then shows the code screen. */
export async function sendPhoneOtpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("sms", 10);
  if (blocked) return blocked;
  const phone = phoneInput(fd);
  if (!phone) return fail("invalid_phone", { phone: "invalid_phone" });
  const { supabase, user } = await signedInUser();
  if (!user) return fail("not_authenticated");
  const next = safeNext(String(fd.get("next") ?? ""), "/");
  const sent = await sendPhoneCode(supabase, user, phone);
  if (!sent.ok) return fail(sent.error, { phone: sent.error });
  if (sent.alreadyVerified) {
    // Same number as the verified one: just make it the profile number again.
    await savePrivateProfile(supabase, user.id, { phone });
    revalidatePath("/", "layout");
    redirect(`/auth/complete-profile?phone_verified=1&next=${encodeURIComponent(next)}`);
  }
  redirect(verifyPhoneUrl(next, { phone, sent: true }));
}

export async function resendPhoneOtpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("sms", 10);
  if (blocked) return blocked;
  const phone = phoneInput(fd);
  if (!phone) return fail("invalid_phone");
  const { supabase, user } = await signedInUser();
  if (!user) return fail("not_authenticated");
  const sent = await sendPhoneCode(supabase, user, phone);
  return sent.ok ? { ok: true } : fail(sent.error);
}

export async function verifyPhoneOtpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("verify", 20);
  if (blocked) return blocked;
  const phone = phoneInput(fd);
  const token = z.string().regex(/^\d{6}$/).safeParse(fd.get("token"));
  if (!phone || !token.success) return fail("otp_invalid");
  const { supabase, user } = await signedInUser();
  if (!user) return fail("not_authenticated");
  // Per-account and per-number limits, so guessing a code from many IPs stays slow.
  if (!rateLimit(`verify-phone:${user.id}`, 10, OTP_WINDOW_MS) || !rateLimit(`verify-phone:${phone}`, 10, OTP_WINDOW_MS)) return fail("rate_limited");
  const { error } = await supabase.auth.verifyOtp({ phone, token: token.data, type: "phone_change" });
  if (error) return fail(toErrorCode(error));
  // Migration 14 copies the verified number to the profile too; this covers databases without it.
  const { error: saveError } = await savePrivateProfile(supabase, user.id, { phone });
  if (saveError) console.error("[auth] verified phone not copied to the profile", saveError.code);
  revalidatePath("/", "layout");
  const next = safeNext(String(fd.get("next") ?? ""), "/");
  redirect(`/auth/complete-profile?phone_verified=1&next=${encodeURIComponent(next)}`);
}

export async function resendEmailOtpAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("resend", 10);
  if (blocked) return blocked;
  const email = emailField.safeParse(fd.get("email"));
  if (!email.success) return fail("invalid_email");
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: email.data });
  if (error) return fail(toErrorCode(error));
  return { ok: true };
}

export async function forgotPasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const blocked = await guard("forgot", 5);
  if (blocked) return blocked;
  const id = parseIdentifier(fd.get("identifier") ?? fd.get("email"));
  if (!id) return fail("invalid_identifier");
  const supabase = await createClient();
  if ("phone" in id) {
    // Phone accounts: a 6-digit SMS code signs them in, then they choose a new password.
    if (!signupSmsAllowed(id.phone)) return fail("rate_limited");
    const { error } = await supabase.auth.signInWithOtp({ phone: id.phone, options: { shouldCreateUser: false } });
    // "otp_disabled" = no account with this number: carry on as if a code was sent.
    if (error && error.code !== "otp_disabled") {
      const code = toErrorCode(error);
      if (code === "rate_limited" || code === "sms_send_failed") return fail(code);
    }
    // Unknown numbers get the same code screen, so they can't be probed.
    redirect(verifySmsUrl(id.phone, "/auth/reset-password", "recovery"));
  }
  const origin = await getOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(id.email, {
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
  if (fd.get("redirect") === "1") redirect("/dashboard?toast=password");
  return { ok: true };
}

export async function updateEmailAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const email = z.string().trim().toLowerCase().email().safeParse(fd.get("email"));
  if (!email.success) return fail("invalid_email");
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
