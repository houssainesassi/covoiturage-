import "server-only";
import { env } from "./env";
import type { VerifyMethod } from "./verification";

type AuthSettings = { external?: { email?: boolean; phone?: boolean }; mailer_autoconfirm?: boolean; phone_autoconfirm?: boolean };

/**
 * Which sign-up methods really send a 6-digit code right now, read from
 * Supabase Auth's public settings. A method whose provider is off, or which
 * Supabase would auto-confirm ("Confirm email" / "Enable phone confirmations"
 * off), is unavailable: it would create a verified account with no code.
 * Fails closed if the settings cannot be read (error, bad status or 5 s timeout).
 */
export async function verificationAvailability(): Promise<Record<VerifyMethod, boolean>> {
  try {
    const res = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: env.supabasePublishableKey },
      cache: "no-store",
      // A hung request must not hang the sign-up page: time out and close sign-up.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = (await res.json()) as AuthSettings;
    const available = {
      email: s.external?.email === true && s.mailer_autoconfirm === false,
      phone: s.external?.phone === true && s.phone_autoconfirm === false,
    };
    if (!available.email || !available.phone) console.warn("[auth] sign-up method without a code is disabled", available);
    return available;
  } catch (e) {
    console.error("[auth] could not read Supabase Auth settings; sign-up disabled", e);
    return { email: false, phone: false };
  }
}
