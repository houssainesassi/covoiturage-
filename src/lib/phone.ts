/**
 * Tunisian phone numbers: 8 national digits, country code +216.
 * First digit 2-9, the same rule as the profile_private check from migration 1.
 * Do not narrow it (e.g. to exclude 6 or 8) without confirming the current INT
 * numbering plan: see supabase/ROLLOUT.md.
 */
export const TN_PHONE_REGEX = /^\+216[2-9]\d{7}$/;

export function normalizeTunisianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("00216")) digits = "+216" + digits.slice(5);
  else if (digits.startsWith("216") && digits.length === 11) digits = "+" + digits;
  else if (/^\d{8}$/.test(digits)) digits = "+216" + digits;
  return TN_PHONE_REGEX.test(digits) ? digits : null;
}

/** +21622123456 → +216 22 123 456 */
export function formatTunisianPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+216(\d{2})(\d{3})(\d{3})$/);
  return m ? `+216 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

/**
 * Lifetime of an SMS code. Must equal "SMS OTP Expiry" in Supabase Auth
 * (Authentication > Providers > Phone). Only used to tell "expired" from "wrong".
 */
export const SMS_CODE_TTL_SECONDS = 300;

/** Seconds between two SMS to the same user (Supabase's own minimum is 60). */
export const SMS_RESEND_SECONDS = 60;

type PhoneUser = { phone?: string | null; phone_confirmed_at?: string | null } | null | undefined;

/**
 * Verified = Supabase Auth confirmed the number by SMS code, and it is the number
 * on the profile (the one passengers see). Same rule as public.is_phone_verified().
 * Auth stores phones without the leading "+".
 */
export function isPhoneVerified(user: PhoneUser, profilePhone: string | null | undefined): boolean {
  if (!user?.phone || !user.phone_confirmed_at || !profilePhone) return false;
  return `+${user.phone.replace(/^\+/, "")}` === profilePhone;
}
