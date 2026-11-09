/** How a new account proves it is real: chosen by the user at sign-up. */
export type VerifyMethod = "email" | "phone";

export const parseMethod = (v: unknown): VerifyMethod | null => (v === "email" || v === "phone" ? v : null);

type AuthUser = { email_confirmed_at?: string | null; phone_confirmed_at?: string | null } | null | undefined;

/**
 * Verified = Supabase Auth confirmed the email OR the phone (by a 6-digit code).
 * Same rule as public.is_account_verified() (migration 15), which gates
 * publishing and booking.
 */
export function isAccountVerified(user: AuthUser): boolean {
  return Boolean(user?.email_confirmed_at || user?.phone_confirmed_at);
}
