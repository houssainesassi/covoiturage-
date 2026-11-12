import "server-only";
import { env } from "./env";

type AuthSettings = { external?: { email?: boolean }; mailer_autoconfirm?: boolean };

/**
 * True only when Supabase Auth will really ask new accounts to confirm their
 * email: the email provider is on and "Confirm email" is on (mailer_autoconfirm
 * false). Otherwise Supabase would create already-verified accounts, so the app
 * closes sign-up. Fails closed (error, bad status or 5 s timeout).
 * Existing accounts can always log in; this only gates new sign-ups.
 */
export async function emailVerificationEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: env.supabasePublishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = (await res.json()) as AuthSettings;
    const enabled = s.external?.email === true && s.mailer_autoconfirm === false;
    if (!enabled) console.warn("[auth] sign-up closed: 'Confirm email' is off in Supabase Auth");
    return enabled;
  } catch (e) {
    console.error("[auth] could not read Supabase Auth settings; sign-up closed", e);
    return false;
  }
}
