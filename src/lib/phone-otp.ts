import "server-only";
import type { User } from "@supabase/supabase-js";
import type { ServerSupabase } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import { SMS_RESEND_SECONDS } from "@/lib/phone";
import { safeNext } from "@/lib/utils";

const HOUR = 60 * 60 * 1000;
const digitsOf = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * App-side SMS limits, on top of Supabase Auth's own (SMS rate limit per hour and
 * the 60 s minimum between two SMS to one number). Per server instance only.
 */
function smsAllowed(userId: string, phone: string) {
  return (
    rateLimit(`sms-cooldown:${userId}`, 1, (SMS_RESEND_SECONDS - 5) * 1000) &&
    rateLimit(`sms-user:${userId}`, 5, HOUR) &&
    rateLimit(`sms-phone:${phone}`, 5, HOUR)
  );
}

export type SmsResult = { ok: true; alreadyVerified?: boolean } | { ok: false; error: ErrorCode };

/**
 * Texts a 6-digit code to attach `phone` (+216…) to the signed-in user's own
 * account (Supabase "phone change"). Also used to resend: each call issues a new
 * code. A number verified on another account is refused by Auth (phone_exists).
 */
export async function sendPhoneCode(supabase: ServerSupabase, user: User, phone: string): Promise<SmsResult> {
  if (user.phone_confirmed_at && digitsOf(user.phone) === digitsOf(phone)) return { ok: true, alreadyVerified: true };
  if (!smsAllowed(user.id, phone)) return { ok: false, error: "rate_limited" };
  const { data, error } = await supabase.auth.updateUser({ phone });
  if (error) return { ok: false, error: toErrorCode(error) };
  // A code is pending only when Auth holds the number as new_phone. Otherwise the
  // number was accepted without any SMS ("Enable phone confirmations" is off).
  if (digitsOf(data.user?.new_phone) !== digitsOf(phone)) {
    console.error("[auth] phone accepted without an SMS code: turn on phone confirmations in Supabase Auth");
    return { ok: false, error: "sms_send_failed" };
  }
  return { ok: true };
}

/** The phone step: the code screen when an SMS went out, else the number screen with the error. */
export function verifyPhoneUrl(next: string, opts: { phone?: string; sent?: boolean; error?: ErrorCode; emailVerified?: boolean } = {}) {
  const q = new URLSearchParams({ next: safeNext(next, "/") });
  if (opts.phone) q.set("phone", opts.phone);
  if (opts.sent) q.set("sent", String(Date.now()));
  if (opts.error) q.set("error", opts.error);
  if (opts.emailVerified) q.set("email_verified", "1");
  return `/auth/verify-phone?${q}`;
}

/** Sends the first code right after sign-up / email verification and says where to go next. */
export async function startPhoneVerification(supabase: ServerSupabase, user: User, phone: string | null, next: string, emailVerified = false) {
  if (!phone) return verifyPhoneUrl(next, { emailVerified });
  const sent = await sendPhoneCode(supabase, user, phone);
  if (sent.ok && sent.alreadyVerified) return `/auth/complete-profile?next=${encodeURIComponent(safeNext(next, "/"))}`;
  return sent.ok ? verifyPhoneUrl(next, { phone, sent: true, emailVerified }) : verifyPhoneUrl(next, { phone, error: sent.error, emailVerified });
}
